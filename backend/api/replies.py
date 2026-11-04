from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from sqlmodel import select

from backend.ai.client import AIUnavailable, Provider
from backend.ai.replies import generate_reply
from backend.ai.schema import Language
from backend.api.contacts import ContactId, get_contact_or_404
from backend.api.models import ContactDetail, ReplyDraftOut, draft_out, to_detail
from backend.config import demo_now
from backend.db import Contact, ReplyDraft, SessionDep, utcnow
from backend.normalize import mark_sent

router = APIRouter(prefix="/api/contacts", tags=["replies"])


def latest_enquiry(contact: Contact):
    return max(contact.enquiries, key=lambda e: (e.received_at, e.id))


def new_draft(contact: Contact, language: str, providers: list[Provider] | None = None) -> ReplyDraft:
    """Ask the AI for a reply to this contact's messages (not saved). Raises AIUnavailable."""
    enquiries = sorted(contact.enquiries, key=lambda e: (e.received_at, e.id))
    latest = enquiries[-1]
    r = generate_reply(
        language=language,
        channel=latest.channel,
        message_type=contact.message_type,
        name=contact.name,
        interest=contact.interest,
        flags=contact.flags,
        missing_info=contact.missing_info,
        missing_phone=contact.missing_phone,
        messages=[e.message for e in enquiries],
        providers=providers,
    )
    return ReplyDraft(
        contact_id=contact.id,
        enquiry_id=latest.id,
        language=r.language,
        format=r.format,
        body=r.body,
        faq_keys_used=r.faq_keys_used,
        needs_confirmation=r.needs_confirmation,
        model_used=r.model_used,
        latency_ms=r.latency_ms,
    )


class ReplyRequest(BaseModel):
    language: Language | None = None  # default: the language the customer wrote in
    regenerate: bool = False  # ignore a saved draft for this message + language


@router.post("/{contact_id}/reply")
def suggest_reply(session: SessionDep, contact_id: ContactId, req: ReplyRequest) -> ReplyDraftOut:
    """Suggested reply for the latest message. Reuses a saved draft in that language unless
    regenerate=true, so switching language back and forth is instant."""
    contact = get_contact_or_404(session, contact_id)
    language = (req.language.value if req.language else None) or contact.language
    latest = latest_enquiry(contact)
    if not req.regenerate:
        saved = session.exec(
            select(ReplyDraft)
            .where(ReplyDraft.enquiry_id == latest.id, ReplyDraft.language == language)
            .order_by(ReplyDraft.created_at.desc(), ReplyDraft.id.desc())
        ).first()
        if saved:
            saved.created_at = utcnow()  # becomes the draft shown on the contact
            session.add(saved)
            session.commit()
            session.refresh(saved)
            return draft_out(saved, contact)
    try:
        draft = new_draft(contact, language)
    except AIUnavailable as e:
        raise HTTPException(status_code=503, detail=f"AI is unavailable right now: {e}") from e
    session.add(draft)
    session.commit()
    session.refresh(draft)
    return draft_out(draft, contact)


class SentRequest(BaseModel):
    body: str | None = None  # what was actually sent (defaults to the latest draft)


@router.post("/{contact_id}/reply/sent")
def reply_sent(session: SessionDep, contact_id: ContactId, req: SentRequest) -> ContactDetail:
    """Staff sent the reply in their own app: log it, clear overdue, move New -> Contacted."""
    contact = get_contact_or_404(session, contact_id)
    body = req.body
    if body is None:
        drafts = sorted(contact.reply_drafts, key=lambda d: (d.created_at, d.id))
        body = drafts[-1].body if drafts else ""
    now = demo_now()
    mark_sent(session, contact, now, body)
    session.commit()
    session.refresh(contact)
    return to_detail(contact, now)
