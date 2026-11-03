from enum import Enum

from fastapi import APIRouter
from pydantic import BaseModel

from backend.ai.schema import AIFlag, Interest, Language, MessageType, Priority, Status
from backend.config import demo_now

router = APIRouter(prefix="/api", tags=["meta"])

CHANNELS = ["WhatsApp", "Facebook Messenger", "Facebook comment", "Website form", "Phone call note"]


class Meta(BaseModel):
    statuses: list[str]
    message_types: list[str]
    interests: list[str]
    languages: list[str]
    priorities: list[str]
    flags: list[str]
    channels: list[str]
    demo_now: str


def _values(enum: type[Enum]) -> list[str]:
    return [member.value for member in enum]


@router.get("/meta")
def get_meta() -> Meta:
    """Enums and the demo clock. The frontend builds its options from this."""
    return Meta(
        statuses=_values(Status),
        message_types=_values(MessageType),
        interests=_values(Interest),
        languages=_values(Language),
        priorities=_values(Priority),
        flags=_values(AIFlag),
        channels=CHANNELS,
        demo_now=demo_now().strftime("%Y-%m-%dT%H:%M"),
    )
