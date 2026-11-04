"""
Reply suggestions (PRD §7.3). Code decides the format, the language and what to ask for;
the AI writes the words from the FAQ only; code then checks every number in the draft.
"""

import re
import unicodedata
from dataclasses import dataclass
from functools import cache
from pathlib import Path

import yaml

from backend.ai.client import Provider, call_json
from backend.ai.prompts import build_reply_messages
from backend.ai.schema import Language, MessageType, ReplyFormat, SuggestedReply

FAQ_PATH = Path(__file__).resolve().parent.parent / "seed" / "faq.yaml"


@cache
def load_faq() -> dict[str, dict]:
    return yaml.safe_load(FAQ_PATH.read_text(encoding="utf-8"))["entries"]


@cache
def faq_text() -> str:
    return "\n".join(f"- {k}: {v['answer']}" for k, v in load_faq().items())


def reply_format(message_type: str, channel: str | None) -> ReplyFormat:
    """Spam gets no reply; Facebook comments get a public reply; phone notes get a call script."""
    if message_type == MessageType.spam.value:
        return ReplyFormat.none
    if channel == "Facebook comment":
        return ReplyFormat.public_comment
    if channel == "Phone call note":
        return ReplyFormat.call_script
    return ReplyFormat.text


def ask_for(missing_info: list[str], missing_phone: bool, fmt: ReplyFormat, flags: list[str]) -> list[str]:
    """What the reply should ask the customer for. Never in public, never from a minor."""
    if fmt in (ReplyFormat.public_comment, ReplyFormat.none) or "minor" in flags:
        return []
    items = [m for m in missing_info if "phone" not in m.lower()]
    if missing_phone and fmt == ReplyFormat.text:
        items.append("a phone number we can call or WhatsApp")
    return items


# ---- Number guard ----
_BANGLA_DIGITS = str.maketrans("০১২৩৪৫৬৭৮৯", "0123456789")
_NUMBER = re.compile(r"\d+(?:[.,]\d+)*")


def numbers_in(text: str) -> set[str]:
    """'8,500' -> '8500', '৳৮,৫০০' -> '8500'. Each number as a plain digit string."""
    return {n.replace(",", "").rstrip(".") for n in _NUMBER.findall(text.translate(_BANGLA_DIGITS))}


@cache
def _faq_numbers() -> frozenset[str]:
    return frozenset(numbers_in(faq_text()))


def unverified_numbers(body: str, customer_messages: list[str]) -> list[str]:
    """Numbers in the draft that appear neither in the FAQ nor in what the customer wrote.
    Any hit -> the UI shows 'check before sending'."""
    allowed = set(_faq_numbers())
    for m in customer_messages:
        allowed |= numbers_in(m)
    return sorted(numbers_in(body) - allowed, key=lambda n: (len(n), n))


# ---- Draft checks (code, not AI) ----
_BANGLA_LETTER = re.compile(r"[\u0980-\u09FF]")
_SENTENCE_END = re.compile(r"[.!?।]+(?:\s|$)")


def foreign_letters(body: str) -> list[str]:
    """Letters that are neither Latin nor Bangla (e.g. a stray Cyrillic 'е' or Hindi word)."""
    out = []
    for ch in body:
        if ch.isalpha() and not unicodedata.name(ch, "").startswith(("LATIN", "BENGALI")):
            out.append(ch)
    return list(dict.fromkeys(out))


def draft_warnings(body: str, language: str, fmt: str, customer_messages: list[str]) -> list[str]:
    """Problems a human should check before sending. Empty list = looks fine."""
    if fmt == ReplyFormat.none.value:
        return []
    warnings = []
    if foreign := foreign_letters(body):
        warnings.append(f"Contains letters from another script: {' '.join(foreign)}")
    has_bangla = bool(_BANGLA_LETTER.search(body))
    if language == Language.bangla.value and not has_bangla:
        warnings.append("Should be in Bangla script")
    if language != Language.bangla.value and has_bangla:
        warnings.append(f"Contains Bangla script but should be {language}")
    if fmt == ReplyFormat.public_comment.value and len(_SENTENCE_END.findall(body.strip())) > 2:
        warnings.append("Public comment is longer than 2 sentences")
    if unverified := unverified_numbers(body, customer_messages):
        warnings.append(f"Numbers not in the FAQ or the customer's message: {', '.join(unverified)}")
    return warnings


@dataclass
class DraftResult:
    language: str
    format: str
    body: str
    faq_keys_used: list[str]
    needs_confirmation: list[str]
    model_used: str | None
    latency_ms: int | None


def generate_reply(
    *,
    language: str,
    channel: str | None,
    message_type: str,
    name: str | None,
    interest: str,
    flags: list[str],
    missing_info: list[str],
    missing_phone: bool,
    messages: list[str],
    providers: list[Provider] | None = None,
) -> DraftResult:
    """Raises AIUnavailable if every provider fails."""
    Language(language)  # validate
    fmt = reply_format(message_type, channel)
    if fmt == ReplyFormat.none:
        return DraftResult(language, fmt.value, "", [], [], None, None)
    prompt = build_reply_messages(
        faq_text=faq_text(),
        target_language=language,
        reply_format=fmt.value,
        channel=channel or "unknown",
        message_type=message_type,
        name=name,
        interest=interest,
        flags=flags,
        ask_for=ask_for(missing_info, missing_phone, fmt, flags),
        messages=messages,
    )
    result = call_json(prompt, SuggestedReply, providers=providers, temperature=0.3)
    warnings = draft_warnings(result.data.body, language, fmt.value, messages)
    if warnings:
        # One rewrite with the problems named; whatever is left is shown as "check before sending".
        retry = [
            *prompt,
            {"role": "assistant", "content": result.data.model_dump_json()},
            {
                "role": "user",
                "content": "Rewrite the reply. Problems found: "
                + "; ".join(warnings)
                + f". Use only {language} and the FAQ facts. Return the JSON object only.",
            },
        ]
        second = call_json(retry, SuggestedReply, providers=providers, temperature=0.3)
        if len(draft_warnings(second.data.body, language, fmt.value, messages)) < len(warnings):
            second.latency_ms += result.latency_ms
            result = second
    r = result.data
    known = load_faq()
    return DraftResult(
        language=language,
        format=fmt.value,
        body=r.body.strip(),
        faq_keys_used=[k for k in dict.fromkeys(r.faq_keys_used) if k in known],
        needs_confirmation=r.needs_confirmation,
        model_used=result.model_used,
        latency_ms=result.latency_ms,
    )
