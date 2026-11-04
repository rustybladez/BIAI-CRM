"""API response models and converters (DB rows -> what the frontend sees).

Datetimes go out as Asia/Dhaka time with offset, e.g. 2026-10-27T17:00:00+06:00.
"""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel

from backend.ai.replies import draft_warnings, unverified_numbers
from backend.ai.schema import Priority
from backend.config import DHAKA
from backend.db import Contact, Enquiry, ReplyDraft
from backend.normalize import PRIORITY_RANK, awaiting_reply, is_overdue


def local(dt: datetime | None) -> datetime | None:
    return dt.astimezone(DHAKA) if dt else None


class ContactSummary(BaseModel):
    id: int
    name: str | None
    role: str | None
    company: str | None
    team_size: int | None
    phone: str | None
    missing_phone: bool
    message_type: str
    interest: str
    language: str
    status: str | None
    priority: str
    priority_reason: str
    flags: list[str]
    follow_up_by: datetime | None
    last_inbound_at: datetime | None
    last_outbound_at: datetime | None
    summary: str
    missing_info: list[str]
    low_confidence_fields: list[str]
    channel: str | None  # channel of the latest message
    channels: list[str]
    enquiry_count: int
    awaiting_reply: bool
    overdue: bool
    due_today: bool  # follow-up time is today (demo clock) and not yet overdue


class EnquiryOut(BaseModel):
    id: int
    seed_id: int | None
    channel: str
    received_at: datetime
    sender_name_raw: str
    phone_raw: str | None
    message: str
    extraction: dict[str, Any]
    model_used: str | None
    latency_ms: int | None


class ActivityOut(BaseModel):
    id: int
    kind: str
    body: str
    at: datetime


class ReplyDraftOut(BaseModel):
    id: int
    enquiry_id: int | None
    language: str
    format: str
    body: str
    faq_keys_used: list[str]
    needs_confirmation: list[str]
    model_used: str | None
    latency_ms: int | None
    created_at: datetime
    unverified_numbers: list[str]  # numbers not in the FAQ or the customer's messages
    warnings: list[str]  # code checks: script, language, length, numbers
    check_before_sending: bool


class ContactDetail(ContactSummary):
    enquiries: list[EnquiryOut]
    activities: list[ActivityOut]
    reply_draft: ReplyDraftOut | None


def _sorted_enquiries(c: Contact) -> list[Enquiry]:
    return sorted(c.enquiries, key=lambda e: (e.received_at, e.id))


def to_summary(c: Contact, now: datetime) -> ContactSummary:
    enquiries = _sorted_enquiries(c)
    overdue = is_overdue(c, now)
    due_today = (
        not overdue
        and awaiting_reply(c)
        and c.status is not None
        and c.follow_up_by is not None
        and local(c.follow_up_by).date() == now.astimezone(DHAKA).date()
    )
    return ContactSummary(
        **c.model_dump(
            include={
                "id",
                "name",
                "role",
                "company",
                "team_size",
                "phone",
                "missing_phone",
                "message_type",
                "interest",
                "language",
                "status",
                "priority",
                "priority_reason",
                "flags",
                "summary",
                "missing_info",
                "low_confidence_fields",
            }
        ),
        follow_up_by=local(c.follow_up_by),
        last_inbound_at=local(c.last_inbound_at),
        last_outbound_at=local(c.last_outbound_at),
        channel=enquiries[-1].channel if enquiries else None,
        channels=list(dict.fromkeys(e.channel for e in enquiries)),
        enquiry_count=len(enquiries),
        awaiting_reply=awaiting_reply(c),
        overdue=overdue,
        due_today=due_today,
    )


def to_detail(c: Contact, now: datetime) -> ContactDetail:
    drafts = sorted(c.reply_drafts, key=lambda d: (d.created_at, d.id))
    latest: ReplyDraft | None = drafts[-1] if drafts else None
    return ContactDetail(
        **to_summary(c, now).model_dump(),
        enquiries=[
            EnquiryOut(
                **e.model_dump(exclude={"extraction_json", "received_at", "contact_id"}),
                received_at=local(e.received_at),
                extraction=e.extraction_json,
            )
            for e in _sorted_enquiries(c)
        ],
        activities=[
            ActivityOut(id=a.id, kind=a.kind, body=a.body, at=local(a.at))
            for a in sorted(c.activities, key=lambda a: (a.at, a.id))
        ],
        reply_draft=draft_out(latest, c) if latest else None,
    )


def draft_out(d: ReplyDraft, c: Contact) -> ReplyDraftOut:
    messages = [e.message for e in c.enquiries]
    warnings = draft_warnings(d.body, d.language, d.format, messages)
    return ReplyDraftOut(
        **d.model_dump(exclude={"created_at", "contact_id"}),
        created_at=local(d.created_at),
        unverified_numbers=unverified_numbers(d.body, messages),
        warnings=warnings,
        check_before_sending=bool(warnings),
    )


SortMode = Literal["priority", "overdue"]


def sort_key(s: ContactSummary, mode: SortMode = "priority") -> tuple:
    """How cards are ordered. Ties go to whoever has waited longest (oldest last message first).

    priority (default): most urgent first, then overdue before not overdue.
        An urgent contact beats a low-priority overdue one.
    overdue: all overdue contacts first, then by priority within each group.
    """
    rank = -PRIORITY_RANK[Priority(s.priority)]
    waited = s.last_inbound_at.timestamp() if s.last_inbound_at else float("inf")
    if mode == "overdue":
        return (not s.overdue, rank, waited)
    return (rank, not s.overdue, waited)
