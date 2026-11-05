"""
Plain-code rules (PRD §6, rules 1-7). The AI judges one message; everything that needs
other records, arithmetic or the clock lives here, so it is deterministic and tested.
"""

import re
from datetime import datetime, timedelta

from sqlalchemy.orm import object_session
from sqlmodel import Session, select

from backend.ai.schema import AIFlag, ExtractedEnquiry, MessageType, Priority, Status
from backend.config import parse_local
from backend.db import Activity, Contact, Enquiry, utcnow

# ---- System flags (added by code, shown next to the AI flags) ----
REPEAT_NO_REPLY = "repeat_no_reply"  # wrote again before we replied
DUPLICATE_MERGED = "duplicate_merged"  # this contact has more than one enquiry
SYSTEM_FLAGS = [REPEAT_NO_REPLY, DUPLICATE_MERGED]

OVERDUE_AFTER = timedelta(hours=48)
PRIORITY_RANK = {Priority.low: 0, Priority.medium: 1, Priority.high: 2, Priority.urgent: 3}
# When merging, the more serious message type wins.
TYPE_RANK = {
    MessageType.spam: 0,
    MessageType.irrelevant: 1,
    MessageType.lead: 2,
    MessageType.support: 3,
    MessageType.complaint: 4,
}
NOT_A_LEAD = {MessageType.spam.value, MessageType.irrelevant.value}

# ---- Rule 1: phone normalisation ----
_BANGLA_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
_BD_MOBILE = re.compile(r"01[3-9]\d{8}")


def normalize_phone(raw: str | None) -> str | None:
    """'০১৭১১০০০০০১', '+8801711000001', '01711-000001' -> '01711000001'. None if not a valid BD mobile."""
    if not raw:
        return None
    digits = re.sub(r"\D", "", raw.translate(_BANGLA_DIGITS))
    if digits.startswith("880"):
        digits = "0" + digits[3:]
    elif len(digits) == 10 and digits.startswith("1"):
        digits = "0" + digits  # a spreadsheet stored the number as a number and dropped the leading 0
    return digits if _BD_MOBILE.fullmatch(digits) else None


def resolve_phone(phone_field: str | None, phone_in_message: str | None) -> str | None:
    """Rule 1-2: the channel's phone field first, else a number written in the message."""
    return normalize_phone(phone_field) or normalize_phone(phone_in_message)


# ---- Rule 7: the AI only sets New or Paid on intake ----
def intake_status(ex: ExtractedEnquiry) -> str | None:
    if ex.message_type.value in NOT_A_LEAD:
        return None
    return Status.paid.value if ex.status == Status.paid else Status.new.value


def _max_priority(a: str, b: str) -> str:
    return a if PRIORITY_RANK[Priority(a)] >= PRIORITY_RANK[Priority(b)] else b


def _add_flags(contact: Contact, *flags: str) -> None:
    contact.flags = [*contact.flags, *(f for f in flags if f not in contact.flags)]


FOLLOW_UP_MAX_AHEAD = timedelta(days=7)


def _follow_up(ex: ExtractedEnquiry, received_at: datetime) -> datetime | None:
    """The AI's contact-by time. Dropped if unparseable, or if it is more than 7 days out with no
    callback asked: that is almost always a join/start date, not a contact time. The 48h rule
    covers those contacts anyway."""
    if not ex.follow_up_by:
        return None
    try:
        when = parse_local(ex.follow_up_by)
    except ValueError:
        return None  # AI returned an unparseable time; the 48h rule still applies
    if when - received_at > FOLLOW_UP_MAX_AHEAD and AIFlag.callback_requested not in ex.flags:
        return None
    return when


# ---- Rules 3-4: create or merge, with escalation ----
def find_duplicate(session: Session, phone: str | None) -> Contact | None:
    """Rule 3: same normalised phone -> same contact. No phone -> never auto-merged."""
    if phone is None:
        return None
    return session.exec(select(Contact).where(Contact.phone == phone)).first()


# ---- Who owes whom a reply: decided by event order, not time ----
# With a frozen demo clock a reply and a new message can share the same timestamp, so comparing times would
# count that message as answered. Activity ids increase in the order events are saved, so an inbound message
# is unanswered when its id is greater than the id of the latest reply_sent activity.


def _events(contact: Contact) -> list[Activity]:
    """This contact's inbound / reply_sent activities, read fresh (includes ones added in this session)."""
    session = object_session(contact)
    if session is None or contact.id is None:
        events = [a for a in contact.activities if a.kind in ("inbound", "reply_sent")]
    else:
        events = list(
            session.exec(
                select(Activity).where(
                    Activity.contact_id == contact.id, Activity.kind.in_(("inbound", "reply_sent"))
                )
            ).all()
        )
    return sorted(events, key=lambda a: a.id or 0)


def unanswered_messages(contact: Contact) -> list[Activity]:
    """Inbound messages saved after our latest reply (all of them if we never replied)."""
    events = _events(contact)
    last_reply = max((a.id or 0 for a in events if a.kind == "reply_sent"), default=0)
    return [a for a in events if a.kind == "inbound" and (a.id or 0) > last_reply]


def no_reply_since_last_message(contact: Contact) -> bool:
    """Before saving a new message: true if the contact's previous message(s) are still unanswered."""
    return bool(unanswered_messages(contact))


def would_escalate(contact: Contact, ex: ExtractedEnquiry) -> bool:
    """Rule 4: a pipeline contact writes again and we have not replied since their previous message."""
    in_pipeline = contact.status is not None or intake_status(ex) is not None
    return in_pipeline and no_reply_since_last_message(contact)


def ingest(
    session: Session,
    *,
    channel: str,
    received_at: datetime,
    sender_name: str,
    phone_raw: str | None,
    message: str,
    extraction: ExtractedEnquiry,
    model_used: str | None = None,
    latency_ms: int | None = None,
    seed_id: int | None = None,
) -> tuple[Contact, bool]:
    """Save one analysed message. Returns (contact, merged). Caller commits."""
    ex = extraction
    phone = resolve_phone(phone_raw, ex.phone_in_message)
    contact = find_duplicate(session, phone)
    merged = contact is not None

    if contact is None:
        contact = Contact(
            name=ex.name,
            role=ex.role,
            company=ex.company,
            team_size=ex.team_size,
            phone=phone,
            missing_phone=phone is None,
            message_type=ex.message_type.value,
            interest=ex.interest.value,
            language=ex.language.value,
            status=intake_status(ex),
            priority=ex.priority.value,
            priority_reason=ex.priority_reason,
            flags=[f.value for f in ex.flags],
            follow_up_by=_follow_up(ex, received_at),
            low_confidence_fields=list(ex.low_confidence_fields),
            summary=ex.summary,
            missing_info=list(ex.missing_info),
        )
    else:
        escalate = would_escalate(contact, ex)
        for f in ("name", "role", "company", "team_size"):
            if getattr(contact, f) is None:
                setattr(contact, f, getattr(ex, f))
        if TYPE_RANK[ex.message_type] > TYPE_RANK[MessageType(contact.message_type)]:
            contact.message_type = ex.message_type.value
        if contact.interest in ("unclear", "not_applicable", "other") and ex.interest.value not in (
            "unclear",
            "not_applicable",
        ):
            contact.interest = ex.interest.value
        if contact.status is None:
            contact.status = intake_status(ex)
        elif ex.status == Status.paid and contact.status == Status.new.value:
            contact.status = Status.paid.value
        contact.language = ex.language.value  # latest message decides the reply language
        new_priority = _max_priority(contact.priority, ex.priority.value)
        if new_priority != contact.priority:
            contact.priority_reason = ex.priority_reason
        contact.priority = new_priority
        _add_flags(contact, *(f.value for f in ex.flags), DUPLICATE_MERGED)
        if escalate:
            contact.priority = Priority.urgent.value
            contact.priority_reason = "Asked again, no reply yet."
            _add_flags(contact, REPEAT_NO_REPLY)
        new_follow_up = _follow_up(ex, received_at)
        if new_follow_up and (contact.follow_up_by is None or new_follow_up < contact.follow_up_by):
            contact.follow_up_by = new_follow_up
        contact.summary = ex.summary
        contact.missing_info = list(ex.missing_info)
        contact.low_confidence_fields = list(ex.low_confidence_fields)
        contact.updated_at = utcnow()

    contact.last_inbound_at = max(filter(None, [contact.last_inbound_at, received_at]))
    session.add(contact)
    session.flush()  # assigns contact.id

    session.add(
        Enquiry(
            contact_id=contact.id,
            seed_id=seed_id,
            channel=channel,
            received_at=received_at,
            sender_name_raw=sender_name,
            phone_raw=phone_raw,
            message=message,
            extraction_json=ex.model_dump(mode="json"),
            model_used=model_used,
            latency_ms=latency_ms,
        )
    )
    session.add(Activity(contact_id=contact.id, kind="inbound", body=message, at=received_at))
    if merged:
        session.add(
            Activity(
                contact_id=contact.id,
                kind="merge",
                body=f"Same phone {phone}: merged into this contact ({channel}).",
                at=received_at,
            )
        )
    return contact, merged


# ---- Rule 5: overdue (48h rule), driven by the demo clock ----
def awaiting_reply(contact: Contact) -> bool:
    """We owe this contact a reply: they have a message saved after our latest reply (event order)."""
    return bool(unanswered_messages(contact))


def waiting_since(contact: Contact) -> datetime | None:
    """When the contact started waiting for us: their first message after our last reply.
    A second message does not restart the clock (Rafi asked on Monday and again on Tuesday: he has
    been waiting since Monday)."""
    unanswered = unanswered_messages(contact)
    return min(a.at for a in unanswered) if unanswered else None


def is_overdue(contact: Contact, now: datetime) -> bool:
    """Rule 5: anyone in the pipeline (any status except Lost) we owe a reply to, whose own follow-up time
    has passed or who has waited more than 48 h since their first unanswered message."""
    if contact.status in (None, Status.lost.value):
        return False
    since = waiting_since(contact)
    if since is None:
        return False
    if contact.follow_up_by is not None and contact.follow_up_by <= now:
        return True
    return now - since > OVERDUE_AFTER


# ---- Rules 6-7: staff actions ----
def change_status(session: Session, contact: Contact, status: str, now: datetime) -> None:
    if status == contact.status:
        return
    Status(status)  # validates
    session.add(
        Activity(contact_id=contact.id, kind="status_change", body=f"{contact.status} → {status}", at=now)
    )
    contact.status = status
    contact.updated_at = utcnow()
    session.add(contact)


def _ai_priority(session: Session, contact: Contact) -> tuple[str, str] | None:
    """Highest priority the AI gave any of this contact's messages, with that message's reason.
    Ties go to the most recent message."""
    enquiries = session.exec(select(Enquiry).where(Enquiry.contact_id == contact.id)).all()
    best: tuple[int, int, str, str] | None = None
    for e in enquiries:
        p, reason = e.extraction_json.get("priority"), e.extraction_json.get("priority_reason", "")
        if p not in {x.value for x in Priority}:
            continue
        key = (PRIORITY_RANK[Priority(p)], e.id or 0, p, reason)
        if best is None or key[:2] > best[:2]:
            best = key
    return (best[2], best[3]) if best else None


def mark_sent(session: Session, contact: Contact, now: datetime, body: str = "") -> None:
    """Rule 6: log the reply, set last_outbound_at (clears overdue), and move New -> Contacted.
    A rule-4 escalation ("asked again, no reply yet") is no longer true once we reply: drop the
    repeat_no_reply flag and go back to the AI's own priority (highest across their messages).
    If they write again before our next reply, rule 4 escalates again."""
    session.add(Activity(contact_id=contact.id, kind="reply_sent", body=body, at=now))
    contact.last_outbound_at = now
    if REPEAT_NO_REPLY in contact.flags:
        contact.flags = [f for f in contact.flags if f != REPEAT_NO_REPLY]
        restored = _ai_priority(session, contact)
        if restored:
            contact.priority, contact.priority_reason = restored
    if contact.status == Status.new.value:
        change_status(session, contact, Status.contacted.value, now)
    contact.updated_at = utcnow()
    session.add(contact)
