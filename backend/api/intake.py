from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from backend.ai.client import AIUnavailable
from backend.ai.extract import extract_enquiry
from backend.ai.schema import ExtractedEnquiry
from backend.api.meta import Channel
from backend.config import demo_now, parse_local
from backend.db import SessionDep
from backend.normalize import find_duplicate, ingest, intake_status, resolve_phone, would_escalate

router = APIRouter(prefix="/api/intake", tags=["intake"])


class IntakeMessage(BaseModel):
    channel: Channel
    sender_name: str = Field(min_length=1, max_length=200)
    phone: str | None = Field(default=None, max_length=40)
    received_at: str | None = Field(
        default=None, description="Dhaka time 'YYYY-MM-DDTHH:MM'. Defaults to the demo clock."
    )
    message: str = Field(min_length=1, max_length=5000)

    @field_validator("received_at")
    @classmethod
    def _valid_time(cls, v: str | None) -> str | None:
        if v:
            parse_local(v)  # raises ValueError -> 422
        return v

    def received(self) -> str:
        return self.received_at or demo_now().strftime("%Y-%m-%dT%H:%M")


class DuplicatePreview(BaseModel):
    contact_id: int
    name: str | None
    status: str | None
    priority: str
    would_escalate: bool  # saving will raise this contact to urgent (asked again, no reply)


class AnalyseResult(BaseModel):
    extraction: ExtractedEnquiry
    model_used: str
    latency_ms: int
    phone: str | None  # normalised, from the phone field or the message
    missing_phone: bool
    status: str | None  # pipeline status on save; None = "Not a lead"
    duplicate: DuplicatePreview | None


@router.post("/analyse")
def analyse(session: SessionDep, msg: IntakeMessage) -> AnalyseResult:
    """Run AI extraction on a pasted message and preview what saving would do. Nothing is saved."""
    try:
        result = extract_enquiry(msg.channel, msg.received(), msg.sender_name, msg.phone, msg.message)
    except AIUnavailable as e:
        raise HTTPException(status_code=503, detail=f"AI is unavailable right now: {e}") from e
    ex = result.data
    phone = resolve_phone(msg.phone, ex.phone_in_message)
    dup = find_duplicate(session, phone)
    return AnalyseResult(
        extraction=ex,
        model_used=result.model_used,
        latency_ms=result.latency_ms,
        phone=phone,
        missing_phone=phone is None,
        status=intake_status(ex),
        duplicate=DuplicatePreview(
            contact_id=dup.id,
            name=dup.name,
            status=dup.status,
            priority=dup.priority,
            would_escalate=would_escalate(dup, ex),
        )
        if dup
        else None,
    )


class SaveRequest(IntakeMessage):
    extraction: ExtractedEnquiry  # from /analyse, possibly corrected by staff
    model_used: str | None = None
    latency_ms: int | None = None


class SaveResult(BaseModel):
    contact_id: int
    merged: bool


@router.post("/save", status_code=201)
def save(session: SessionDep, req: SaveRequest) -> SaveResult:
    """Save an analysed message: creates a contact, or merges into the one with the same phone."""
    contact, merged = ingest(
        session,
        channel=req.channel,
        received_at=parse_local(req.received()),
        sender_name=req.sender_name,
        phone_raw=req.phone,
        message=req.message,
        extraction=req.extraction,
        model_used=req.model_used,
        latency_ms=req.latency_ms,
    )
    session.commit()
    return SaveResult(contact_id=contact.id, merged=merged)
