from typing import Annotated

from fastapi import APIRouter, HTTPException, Path, Query
from pydantic import BaseModel, Field, field_validator
from sqlmodel import select

from backend.ai.schema import Interest, Language, MessageType, Priority, Status
from backend.api.meta import Channel
from backend.api.models import ContactDetail, ContactSummary, SortMode, sort_key, to_detail, to_summary
from backend.config import demo_now, parse_local
from backend.db import Activity, Contact, SessionDep, utcnow
from backend.normalize import NOT_A_LEAD, change_status, normalize_phone

router = APIRouter(prefix="/api/contacts", tags=["contacts"])

ContactId = Annotated[int, Path(ge=1)]


def get_contact_or_404(session: SessionDep, contact_id: int) -> Contact:
    contact = session.get(Contact, contact_id)
    if contact is None:
        raise HTTPException(status_code=404, detail=f"Contact {contact_id} not found")
    return contact


@router.get("")
def list_contacts(
    session: SessionDep,
    status: Status | None = None,
    interest: Interest | None = None,
    channel: Channel | None = None,
    priority: Priority | None = None,
    overdue: bool | None = None,
    message_type: Annotated[MessageType | None, Query(alias="type")] = None,
    lane: Annotated[str | None, Query(pattern="^(pipeline|not_a_lead)$")] = None,
    sort: SortMode = "priority",
) -> list[ContactSummary]:
    """Contacts sorted by `sort`: `priority` (default: most urgent first, then overdue) or `overdue`
    (overdue first, then priority); ties go to the longest wait. `lane=pipeline` hides spam /
    irrelevant; `lane=not_a_lead` shows only them."""
    query = select(Contact)
    if status:
        query = query.where(Contact.status == status.value)
    if interest:
        query = query.where(Contact.interest == interest.value)
    if priority:
        query = query.where(Contact.priority == priority.value)
    if message_type:
        query = query.where(Contact.message_type == message_type.value)
    if lane == "pipeline":
        query = query.where(Contact.status != None)  # noqa: E711
    elif lane == "not_a_lead":
        query = query.where(Contact.status == None)  # noqa: E711

    now = demo_now()
    items = [to_summary(c, now) for c in session.exec(query).all()]
    if channel:
        items = [s for s in items if channel in s.channels]
    if overdue is not None:
        items = [s for s in items if s.overdue == overdue]
    return sorted(items, key=lambda c: sort_key(c, sort))


@router.get("/{contact_id}")
def get_contact(session: SessionDep, contact_id: ContactId) -> ContactDetail:
    """One contact with every message, the timeline and the latest reply draft."""
    return to_detail(get_contact_or_404(session, contact_id), demo_now())


class ContactUpdate(BaseModel):
    """Only the fields sent are changed. Editing a field marks it as checked by a human."""

    name: str | None = None
    role: str | None = None
    company: str | None = None
    team_size: int | None = Field(default=None, ge=1)
    phone: str | None = None
    message_type: MessageType | None = None
    interest: Interest | None = None
    language: Language | None = None
    status: Status | None = None
    priority: Priority | None = None
    priority_reason: str | None = None
    follow_up_by: str | None = Field(
        default=None, description="Dhaka time 'YYYY-MM-DDTHH:MM', or null to clear"
    )
    summary: str | None = None
    note: str | None = Field(default=None, description="Adds a note to the timeline")

    @field_validator("follow_up_by")
    @classmethod
    def _valid_time(cls, v: str | None) -> str | None:
        if v:
            parse_local(v)  # raises ValueError -> 422
        return v


@router.patch("/{contact_id}")
def update_contact(session: SessionDep, contact_id: ContactId, update: ContactUpdate) -> ContactDetail:
    contact = get_contact_or_404(session, contact_id)
    data = update.model_dump(exclude_unset=True, mode="json")
    now = demo_now()

    if "phone" in data:
        phone = normalize_phone(data["phone"]) if data["phone"] else None
        if data["phone"] and phone is None:
            raise HTTPException(status_code=422, detail="Not a valid Bangladesh mobile number")
        other = session.exec(select(Contact).where(Contact.phone == phone, Contact.id != contact.id)).first()
        if phone and other:
            raise HTTPException(status_code=409, detail=f"Phone already belongs to contact {other.id}")
        data["phone"] = phone
        contact.missing_phone = phone is None

    note = data.pop("note", None)
    if note:
        session.add(Activity(contact_id=contact.id, kind="note", body=note, at=now))

    if "status" in data:
        status = data.pop("status")
        if status is None:
            if contact.status is not None:
                session.add(
                    Activity(
                        contact_id=contact.id,
                        kind="status_change",
                        body=f"{contact.status} → Not a lead",
                        at=now,
                    )
                )
            contact.status = None
        else:
            change_status(session, contact, status, now)

    if "message_type" in data and data["message_type"] not in NOT_A_LEAD and contact.status is None:
        # Moved out of the "Not a lead" tray: put it back in the pipeline.
        change_status(session, contact, Status.new.value, now)

    if "follow_up_by" in data:
        data["follow_up_by"] = parse_local(data["follow_up_by"]) if data["follow_up_by"] else None

    for field, value in data.items():
        setattr(contact, field, value)
    contact.low_confidence_fields = [f for f in contact.low_confidence_fields if f not in data]
    contact.updated_at = utcnow()
    session.add(contact)
    session.commit()
    session.refresh(contact)
    return to_detail(contact, now)
