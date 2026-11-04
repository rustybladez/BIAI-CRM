"""
Weekly summary, PRD §7.5. Code computes every number here; the AI only writes words around them.
"""

import hashlib
import json
from collections import Counter
from datetime import datetime, time, timedelta
from pathlib import Path

from sqlmodel import Session, select

from backend.ai.client import Provider, call_json
from backend.ai.prompts import build_summary_messages
from backend.ai.replies import numbers_in
from backend.ai.schema import Priority, WeeklySummary
from backend.config import DHAKA
from backend.db import Activity, Contact, Enquiry
from backend.normalize import PRIORITY_RANK, awaiting_reply, is_overdue

CHASE_CANDIDATES = 8


def week_start(now: datetime) -> datetime:
    """Bangladesh workweek starts on Sunday."""
    local = now.astimezone(DHAKA)
    days_since_sunday = (local.weekday() + 1) % 7  # Monday=0 ... Sunday=6
    return datetime.combine(local.date() - timedelta(days=days_since_sunday), time(0, 0), tzinfo=DHAKA)


def _fmt(dt: datetime | None) -> str | None:
    return dt.astimezone(DHAKA).strftime("%a %d %b %Y, %H:%M") if dt else None


def _hours_waiting(c: Contact, now: datetime) -> int | None:
    if not awaiting_reply(c) or c.last_inbound_at is None:
        return None
    return int((now - c.last_inbound_at).total_seconds() // 3600)


def _person(c: Contact, now: datetime) -> dict:
    return {
        "contact_id": c.id,
        "name": c.name or "Unknown sender",
        "status": c.status,
        "type": c.message_type,
        "interest": c.interest,
        "priority": c.priority,
        "priority_reason": c.priority_reason,
        "overdue": is_overdue(c, now),
        "hours_waiting_for_reply": _hours_waiting(c, now),
        "flags": c.flags + (["missing_phone"] if c.missing_phone else []),
        "summary": c.summary,
    }


def chase_rank(c: Contact, now: datetime) -> tuple:
    """Who to chase first: most urgent, then overdue, then longest wait.
    (An urgent contact who is not overdue yet beats a low-priority overdue one.)"""
    waiting = _hours_waiting(c, now) or 0
    return (-PRIORITY_RANK[Priority(c.priority)], not is_overdue(c, now), -waiting)


def compute_stats(session: Session, now: datetime) -> dict:
    contacts = session.exec(select(Contact)).all()
    enquiries = session.exec(select(Enquiry)).all()
    start = week_start(now)
    pipeline = [c for c in contacts if c.status is not None]
    this_week = [e for e in enquiries if start <= e.received_at <= now]
    new_contacts = [
        c for c in contacts if c.enquiries and start <= min(e.received_at for e in c.enquiries) <= now
    ]
    replies = session.exec(select(Activity).where(Activity.kind == "reply_sent")).all()
    replies_this_week = [a for a in replies if start <= a.at <= now]
    corporate = [c for c in pipeline if c.interest == "corporate"]
    overdue = sorted((c for c in pipeline if is_overdue(c, now)), key=lambda c: chase_rank(c, now))
    urgent = sorted((c for c in pipeline if c.priority == "urgent"), key=lambda c: chase_rank(c, now))
    awaiting = [c for c in pipeline if awaiting_reply(c) and c.status != "Lost"]
    candidates = sorted(
        (c for c in awaiting if is_overdue(c, now) or c.priority in ("urgent", "high")),
        key=lambda c: chase_rank(c, now),
    )[:CHASE_CANDIDATES]

    return {
        "as_of": _fmt(now),
        "week_starts": _fmt(start),
        "contacts_total": len(contacts),
        "messages_total": len(enquiries),
        "this_week": {
            "messages_received": len(this_week),
            "new_contacts": len(new_contacts),
            "replies_sent": len(replies_this_week),
        },
        "pipeline_total": len(pipeline),
        "pipeline_by_status": {
            s: sum(c.status == s for c in pipeline)
            for s in ["New", "Contacted", "Interested", "Paid", "Lost"]
        },
        "waiting_for_our_reply": len(awaiting),
        "overdue_count": len(overdue),
        "urgent_count": len(urgent),
        "not_a_lead": dict(Counter(c.message_type for c in contacts if c.status is None)),
        "messages_by_channel": dict(Counter(e.channel for e in enquiries).most_common()),
        "pipeline_by_interest": dict(Counter(c.interest for c in pipeline).most_common()),
        "contacts_by_language": dict(Counter(c.language for c in contacts).most_common()),
        "pipeline_by_type": dict(Counter(c.message_type for c in pipeline).most_common()),
        "missing_phone": sum(c.missing_phone for c in pipeline),
        "corporate": {
            "leads": len(corporate),
            "total_people_to_train": sum(c.team_size or 0 for c in corporate),
            "list": [
                {
                    "contact_id": c.id,
                    "name": c.name,
                    "company": c.company,
                    "team_size": c.team_size,
                    "status": c.status,
                }
                for c in sorted(corporate, key=lambda c: -(c.team_size or 0))
            ],
        },
        "overdue": [_person(c, now) for c in overdue],
        "urgent": [_person(c, now) for c in urgent],
        "chase_candidates_ranked": [_person(c, now) for c in candidates],
    }


def fingerprint(stats: dict) -> str:
    """Same data -> same fingerprint, so a saved summary can be reused without an AI call."""
    return hashlib.sha256(json.dumps(stats, sort_keys=True, ensure_ascii=False).encode()).hexdigest()[:16]


# ---- AI words + code checks ----
SEED_SUMMARY_PATH = Path(__file__).parent / "seed" / "summary.json"


def unverified_numbers_in_summary(s: WeeklySummary, stats: dict) -> list[str]:
    """Numbers the AI wrote that do not appear anywhere in the computed figures."""
    allowed = numbers_in(json.dumps(stats, ensure_ascii=False))
    text = " ".join([s.overview, s.observation, *(c.reason for c in s.chase_first)])
    return sorted(numbers_in(text) - allowed, key=lambda n: (len(n), n))


def _clean(s: WeeklySummary, stats: dict) -> WeeklySummary:
    """Keep only contacts from the candidate list, no duplicates, at most 5."""
    allowed = {p["contact_id"] for p in stats["chase_candidates_ranked"]}
    seen: set[int] = set()
    items = []
    for item in s.chase_first:
        if item.contact_id in allowed and item.contact_id not in seen:
            seen.add(item.contact_id)
            items.append(item)
    return s.model_copy(update={"chase_first": items[:5]})


def generate_summary(stats: dict, providers: list[Provider] | None = None) -> dict:
    """Raises AIUnavailable. Returns a dict ready to cache / serve."""
    messages = build_summary_messages(stats)
    result = call_json(messages, WeeklySummary, providers=providers, temperature=0.2)
    summary = _clean(result.data, stats)
    unverified = unverified_numbers_in_summary(summary, stats)
    latency = result.latency_ms
    if unverified:
        retry = [
            *messages,
            {"role": "assistant", "content": result.data.model_dump_json()},
            {
                "role": "user",
                "content": f"These numbers are not in the figures: {', '.join(unverified)}. "
                "Rewrite using only numbers that appear in the figures. Return the JSON object only.",
            },
        ]
        second = call_json(retry, WeeklySummary, providers=providers, temperature=0.2)
        second_summary = _clean(second.data, stats)
        if len(unverified_numbers_in_summary(second_summary, stats)) < len(unverified):
            summary, result = second_summary, second
            latency += second.latency_ms
            unverified = unverified_numbers_in_summary(summary, stats)
    return {
        "fingerprint": fingerprint(stats),
        "generated_at": datetime.now(DHAKA).strftime("%Y-%m-%d %H:%M"),
        "model_used": result.model_used,
        "latency_ms": latency,
        "summary": summary.model_dump(),
        "unverified_numbers": unverified,
    }


# In-memory cache: fingerprint -> generated summary. Starts with the pre-generated seed summary,
# so the seeded demo shows a summary without any live AI call.
_cache: dict[str, dict] = {}


def cached(fp: str) -> dict | None:
    if not _cache and SEED_SUMMARY_PATH.exists():
        seed = json.loads(SEED_SUMMARY_PATH.read_text(encoding="utf-8"))
        _cache[seed["fingerprint"]] = seed
    return _cache.get(fp)


def remember(entry: dict) -> None:
    _cache[entry["fingerprint"]] = entry
