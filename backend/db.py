"""SQLModel tables (PRD §6) and the DB session.

Datetimes are timezone-aware. SQLModel stores them as UTC and returns aware UTC values;
convert to Asia/Dhaka (config.DHAKA) only for display.
"""

import os
from collections.abc import Iterator
from datetime import UTC, datetime
from typing import Annotated, Any

from fastapi import Depends
from sqlalchemy import JSON, inspect, text
from sqlalchemy.pool import StaticPool
from sqlmodel import Field, Relationship, Session, SQLModel, create_engine

from backend.config import DATA_DIR


def utcnow() -> datetime:
    return datetime.now(UTC)


class Contact(SQLModel, table=True):
    """One per person. Enquiries with the same normalised phone merge into one contact."""

    id: int | None = Field(default=None, primary_key=True)
    name: str | None = None
    role: str | None = None
    company: str | None = None
    team_size: int | None = None

    phone: str | None = Field(default=None, unique=True, index=True)  # normalised; many NULLs allowed
    missing_phone: bool = False

    message_type: str  # MessageType
    interest: str  # Interest
    language: str  # Language
    status: str | None = None  # Status; None = not a lead (spam / irrelevant)
    # AI-suggested next stage from the latest merged message; shown as a chip, never applied automatically.
    suggested_status: str | None = None
    priority: str  # Priority
    priority_reason: str = ""
    flags: list[str] = Field(default_factory=list, sa_type=JSON)  # AI flags + system flags

    follow_up_by: datetime | None = None
    last_inbound_at: datetime | None = None
    last_outbound_at: datetime | None = None

    low_confidence_fields: list[str] = Field(default_factory=list, sa_type=JSON)
    summary: str = ""
    missing_info: list[str] = Field(default_factory=list, sa_type=JSON)

    created_at: datetime = Field(default_factory=utcnow)
    updated_at: datetime = Field(default_factory=utcnow)

    enquiries: list["Enquiry"] = Relationship(back_populates="contact", cascade_delete=True)
    activities: list["Activity"] = Relationship(back_populates="contact", cascade_delete=True)
    reply_drafts: list["ReplyDraft"] = Relationship(back_populates="contact", cascade_delete=True)


class Enquiry(SQLModel, table=True):
    """One per incoming message."""

    id: int | None = Field(default=None, primary_key=True)
    contact_id: int = Field(foreign_key="contact.id", index=True, ondelete="CASCADE")
    seed_id: int | None = None  # id in seed/enquiries.csv; None for pasted messages
    channel: str
    received_at: datetime
    sender_name_raw: str
    phone_raw: str | None = None
    message: str
    extraction_json: dict[str, Any] = Field(default_factory=dict, sa_type=JSON)  # validated ExtractedEnquiry
    model_used: str | None = None
    latency_ms: int | None = None

    contact: Contact = Relationship(back_populates="enquiries")


class Activity(SQLModel, table=True):
    """Timeline entry: inbound | reply_sent | status_change | note | merge."""

    id: int | None = Field(default=None, primary_key=True)
    contact_id: int = Field(foreign_key="contact.id", index=True, ondelete="CASCADE")
    kind: str
    body: str = ""
    at: datetime = Field(default_factory=utcnow)

    contact: Contact = Relationship(back_populates="activities")


class ReplyDraft(SQLModel, table=True):
    """AI-suggested reply draft (one per enquiry + language; the newest is shown)."""

    id: int | None = Field(default=None, primary_key=True)
    contact_id: int = Field(foreign_key="contact.id", index=True, ondelete="CASCADE")
    enquiry_id: int | None = Field(default=None, foreign_key="enquiry.id")
    language: str
    format: str  # text | public_comment | call_script | none
    body: str = ""
    faq_keys_used: list[str] = Field(default_factory=list, sa_type=JSON)
    needs_confirmation: list[str] = Field(default_factory=list, sa_type=JSON)
    model_used: str | None = None
    latency_ms: int | None = None
    created_at: datetime = Field(default_factory=utcnow)

    contact: Contact = Relationship(back_populates="reply_drafts")


def make_engine(url: str):
    if url in ("sqlite://", "sqlite:///:memory:"):
        # One shared in-memory DB across threads (tests).
        return create_engine(url, connect_args={"check_same_thread": False}, poolclass=StaticPool)
    return create_engine(url, connect_args={"check_same_thread": False})


def default_url() -> str:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return os.getenv("DATABASE_URL") or f"sqlite:///{DATA_DIR / 'crm.db'}"


engine = make_engine(default_url())


# Columns added after the first release. create_all() does not add columns to an existing table.
_ADDED_COLUMNS = {"contact": {"suggested_status": "VARCHAR"}}


def create_tables(eng=None) -> None:
    eng = eng or engine
    SQLModel.metadata.create_all(eng)
    with eng.begin() as conn:
        for table, columns in _ADDED_COLUMNS.items():
            have = {c["name"] for c in inspect(conn).get_columns(table)}
            for name, sql_type in columns.items():
                if name not in have:
                    conn.execute(text(f"ALTER TABLE {table} ADD COLUMN {name} {sql_type}"))


def get_session() -> Iterator[Session]:
    with Session(engine) as session:
        yield session


SessionDep = Annotated[Session, Depends(get_session)]
