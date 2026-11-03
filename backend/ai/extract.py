"""Run AI extraction on one enquiry."""

from .client import AIResult, Provider, call_json
from .prompts import build_extraction_messages
from .schema import ExtractedEnquiry


def extract_enquiry(
    channel: str,
    received_at: str,
    sender_name: str,
    phone: str | None,
    message: str,
    *,
    providers: list[Provider] | None = None,
) -> AIResult[ExtractedEnquiry]:
    messages = build_extraction_messages(channel, received_at, sender_name, phone, message)
    return call_json(messages, ExtractedEnquiry, providers=providers)
