from typing import Literal

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from backend.ai.client import AIUnavailable
from backend.ai.extract import extract_enquiry
from backend.ai.schema import Channel, ExtractedEnquiry
from backend.config import demo_now, parse_local
from backend.db import SessionDep
from backend.normalize import (
    change_status,
    find_duplicate,
    ingest,
    intake_status,
    resolve_phone,
    status_suggestion,
    would_escalate,
)

router = APIRouter(prefix="/api/intake", tags=["intake"])


class IntakeMessage(BaseModel):
    """Only the message is required. Empty fields are filled from the paste by the AI (form wins)."""

    channel: Channel | None = None
    sender_name: str | None = Field(default=None, max_length=200)
    phone: str | None = Field(default=None, max_length=40)
    received_at: str | None = Field(
        default=None,
        description="Dhaka time 'YYYY-MM-DDTHH:MM'. Else the time in the paste, else the demo clock.",
    )
    message: str = Field(min_length=1, max_length=5000)

    @field_validator("sender_name", "phone", "received_at", mode="before")
    @classmethod
    def _blank_is_none(cls, v: str | None) -> str | None:
        return v.strip() or None if isinstance(v, str) else v

    @field_validator("received_at")
    @classmethod
    def _valid_time(cls, v: str | None) -> str | None:
        if v:
            parse_local(v)  # raises ValueError -> 422
        return v


TimeSource = Literal["form", "message", "demo_clock"]


def _valid_local(value: str | None) -> str | None:
    if not value:
        return None
    try:
        return parse_local(value).strftime("%Y-%m-%dT%H:%M")
    except ValueError:
        return None  # the AI returned something that is not a time: ignore it


def resolve_received(msg: IntakeMessage, ex: ExtractedEnquiry | None) -> tuple[str, TimeSource]:
    """Form value first, then a time found in the paste, then the demo clock."""
    if msg.received_at:
        return parse_local(msg.received_at).strftime("%Y-%m-%dT%H:%M"), "form"
    if ex and (found := _valid_local(ex.received_at_in_message)):
        return found, "message"
    return demo_now().strftime("%Y-%m-%dT%H:%M"), "demo_clock"


def resolve_channel(msg: IntakeMessage, ex: ExtractedEnquiry | None) -> Channel | None:
    """Form value first, then a channel the paste names. None = staff must pick one before saving."""
    return msg.channel or (ex.channel_in_message if ex else None)


class DuplicatePreview(BaseModel):
    contact_id: int
    name: str | None
    status: str | None
    priority: str
    would_escalate: bool  # saving will raise this contact to urgent (asked again, no reply)
    suggested_status: str | None  # AI-suggested stage for this contact; applied only if staff click it


class AnalyseResult(BaseModel):
    extraction: ExtractedEnquiry
    model_used: str
    latency_ms: int
    phone: str | None  # normalised, from the phone field or the message
    missing_phone: bool
    status: str | None  # pipeline status on save; None = "Not a lead"
    duplicate: DuplicatePreview | None
    channel: Channel | None  # form value, else from the paste; None = "Please fill"
    received_at: str  # form value, else from the paste, else the demo clock
    received_at_source: TimeSource


@router.post("/analyse")
def analyse(session: SessionDep, msg: IntakeMessage) -> AnalyseResult:
    """Run AI extraction on a pasted message and preview what saving would do. Nothing is saved."""
    clock, _ = resolve_received(msg, None)
    try:
        result = extract_enquiry(
            msg.channel,
            clock,
            msg.sender_name,
            msg.phone,
            msg.message,
            received_at_given=msg.received_at is not None,
        )
    except AIUnavailable as e:
        raise HTTPException(status_code=503, detail=e.user_message()) from e
    ex = result.data
    phone = resolve_phone(msg.phone, ex.phone_in_message)
    dup = find_duplicate(session, phone)
    received_at, source = resolve_received(msg, ex)
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
            suggested_status=status_suggestion(dup.status, ex),
        )
        if dup
        else None,
        channel=resolve_channel(msg, ex),
        received_at=received_at,
        received_at_source=source,
    )


class SaveRequest(IntakeMessage):
    extraction: ExtractedEnquiry  # from /analyse, possibly corrected by staff
    model_used: str | None = None
    latency_ms: int | None = None
    apply_suggested_status: bool = False  # staff clicked "Move" on the merge preview chip


class SaveResult(BaseModel):
    contact_id: int
    merged: bool


@router.post("/save", status_code=201)
def save(session: SessionDep, req: SaveRequest) -> SaveResult:
    """Save an analysed message: creates a contact, or merges into the one with the same phone.
    A channel is required (form or paste); a name is not."""
    channel = resolve_channel(req, req.extraction)
    if channel is None:
        raise HTTPException(status_code=422, detail="Please choose the channel this message came from.")
    received_at, _ = resolve_received(req, req.extraction)
    contact, merged = ingest(
        session,
        channel=channel,
        received_at=parse_local(received_at),
        sender_name=req.sender_name or "",
        phone_raw=req.phone,
        message=req.message,
        extraction=req.extraction,
        model_used=req.model_used,
        latency_ms=req.latency_ms,
    )
    if req.apply_suggested_status and contact.suggested_status:
        change_status(session, contact, contact.suggested_status, demo_now())
    session.commit()
    return SaveResult(contact_id=contact.id, merged=merged)
