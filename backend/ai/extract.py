"""Run AI extraction on one enquiry."""

from .client import AIResult, Provider, call_json
from .prompts import build_extraction_messages
from .schema import ExtractedEnquiry


def extract_enquiry(
    channel: str | None,
    received_at: str,
    sender_name: str | None,
    phone: str | None,
    message: str,
    *,
    received_at_given: bool = True,
    providers: list[Provider] | None = None,
) -> AIResult[ExtractedEnquiry]:
    """received_at_given=False means received_at is only the demo clock: a time in the paste wins."""
    messages = build_extraction_messages(channel, received_at, sender_name, phone, message, received_at_given)
    return call_json(messages, ExtractedEnquiry, providers=providers)
