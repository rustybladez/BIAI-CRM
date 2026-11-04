import csv
import io

from fastapi import APIRouter
from fastapi.responses import Response
from pydantic import BaseModel
from sqlmodel import select

from backend.ai.client import AIUnavailable
from backend.api.models import local
from backend.config import demo_now
from backend.db import Contact, SessionDep
from backend.normalize import is_overdue
from backend.summary import cached, compute_stats, fingerprint, generate_summary, remember

router = APIRouter(prefix="/api", tags=["summary"])


class ChaseOut(BaseModel):
    contact_id: int
    name: str
    priority: str
    overdue: bool
    reason: str


class SummaryOut(BaseModel):
    overview: str
    observation: str
    chase_first: list[ChaseOut]
    model_used: str | None
    latency_ms: int | None
    generated_at: str
    unverified_numbers: list[str]  # numbers in the text that are not in the computed figures


class WeeklyReport(BaseModel):
    stats: dict  # every number, computed by code
    summary: SummaryOut | None  # words by AI; None until generated for this exact data
    error: str | None = None


def _out(entry: dict, stats: dict) -> SummaryOut:
    people = {p["contact_id"]: p for p in stats["chase_candidates_ranked"]}
    s = entry["summary"]
    return SummaryOut(
        overview=s["overview"],
        observation=s["observation"],
        chase_first=[
            ChaseOut(
                contact_id=c["contact_id"],
                name=people[c["contact_id"]]["name"],
                priority=people[c["contact_id"]]["priority"],
                overdue=people[c["contact_id"]]["overdue"],
                reason=c["reason"],
            )
            for c in s["chase_first"]
            if c["contact_id"] in people
        ],
        model_used=entry.get("model_used"),
        latency_ms=entry.get("latency_ms"),
        generated_at=entry["generated_at"],
        unverified_numbers=entry.get("unverified_numbers", []),
    )


@router.get("/summary/weekly")
def get_weekly(session: SessionDep) -> WeeklyReport:
    """The computed figures, plus the AI summary if one exists for exactly this data. No AI call."""
    stats = compute_stats(session, demo_now())
    entry = cached(fingerprint(stats))
    return WeeklyReport(stats=stats, summary=_out(entry, stats) if entry else None)


@router.post("/summary/weekly")
def generate_weekly(session: SessionDep) -> WeeklyReport:
    """Ask the AI to write the summary for the current figures (the numbers never come from the AI)."""
    stats = compute_stats(session, demo_now())
    try:
        entry = generate_summary(stats)
    except AIUnavailable as e:
        return WeeklyReport(stats=stats, summary=None, error=f"AI is unavailable right now: {e}")
    remember(entry)
    return WeeklyReport(stats=stats, summary=_out(entry, stats))


EXPORT_COLUMNS = [
    "id",
    "name",
    "role",
    "company",
    "team_size",
    "phone",
    "status",
    "message_type",
    "interest",
    "language",
    "priority",
    "priority_reason",
    "overdue",
    "follow_up_by",
    "last_message_at",
    "channels",
    "flags",
    "summary",
]


@router.get("/export.csv", response_class=Response)
def export_csv(session: SessionDep) -> Response:
    """All contacts as CSV (UTF-8 with BOM so Excel shows Bangla correctly)."""
    now = demo_now()
    buf = io.StringIO()
    writer = csv.writer(buf)
    writer.writerow(EXPORT_COLUMNS)
    for c in sorted(session.exec(select(Contact)).all(), key=lambda c: c.id):
        channels = list(dict.fromkeys(e.channel for e in sorted(c.enquiries, key=lambda e: e.received_at)))
        writer.writerow(
            [
                c.id,
                c.name,
                c.role,
                c.company,
                c.team_size,
                c.phone,
                c.status or "Not a lead",
                c.message_type,
                c.interest,
                c.language,
                c.priority,
                c.priority_reason,
                "yes" if is_overdue(c, now) else "",
                local(c.follow_up_by).strftime("%Y-%m-%d %H:%M") if c.follow_up_by else "",
                local(c.last_inbound_at).strftime("%Y-%m-%d %H:%M") if c.last_inbound_at else "",
                "; ".join(channels),
                "; ".join(c.flags),
                c.summary,
            ]
        )
    return Response(
        content="﻿" + buf.getvalue(),
        media_type="text/csv; charset=utf-8",
        headers={"Content-Disposition": 'attachment; filename="biai-crm-contacts.csv"'},
    )
