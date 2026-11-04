from datetime import datetime

from fastapi import APIRouter
from pydantic import BaseModel
from sqlmodel import select

from backend.api.models import ContactSummary, local, sort_key, to_summary
from backend.config import demo_now
from backend.db import Contact, SessionDep

router = APIRouter(prefix="/api", tags=["followups"])


class Followups(BaseModel):
    now: datetime
    overdue: list[ContactSummary]
    due_today: list[ContactSummary]


@router.get("/followups")
def get_followups(session: SessionDep) -> Followups:
    """Who needs a reply: overdue (48h rule or follow-up time passed) and due later today."""
    now = demo_now()
    items = sorted((to_summary(c, now) for c in session.exec(select(Contact)).all()), key=sort_key)
    return Followups(
        now=local(now),
        overdue=[s for s in items if s.overdue],
        due_today=sorted([s for s in items if s.due_today], key=lambda s: s.follow_up_by),
    )
