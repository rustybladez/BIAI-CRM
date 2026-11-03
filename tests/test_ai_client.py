"""AI client routing tests with a fake OpenAI client (no network, no keys)."""

import json
from types import SimpleNamespace

import httpx
import pytest
from openai import APITimeoutError

from backend.ai import client as ai
from backend.ai.schema import ExtractedEnquiry

VALID = {
    "message_type": "lead",
    "message_type_reason": "Asks about a course.",
    "interest": "bootcamp",
    "language": "english",
    "status": "New",
    "priority": "medium",
    "priority_reason": "Normal question.",
    "summary": "Asks about the bootcamp.",
}
DS = ai.Provider("deepseek", "deepseek-chat", "https://ds", "k1")
GM = ai.Provider("gemini", "gemini-x", "https://gm", "k2")


def fake_clients(monkeypatch, script: dict[str, list]):
    """script[provider] = list of replies: a str (content) or an Exception to raise."""
    calls: list[str] = []

    def make(p):
        def create(**kwargs):
            calls.append(p.name)
            assert kwargs["response_format"] == {"type": "json_object"}
            item = script[p.name].pop(0)
            if isinstance(item, Exception):
                raise item
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content=item))])

        return SimpleNamespace(chat=SimpleNamespace(completions=SimpleNamespace(create=create)))

    monkeypatch.setattr(ai, "_client", make)
    return calls


def test_primary_first_try(monkeypatch):
    calls = fake_clients(monkeypatch, {"deepseek": [json.dumps(VALID)]})
    r = ai.call_json([], ExtractedEnquiry, providers=[DS, GM])
    assert calls == ["deepseek"] and r.model_used == "deepseek:deepseek-chat" and r.first_try_valid


def test_code_fence_is_tolerated(monkeypatch):
    fake_clients(monkeypatch, {"deepseek": ["```json\n" + json.dumps(VALID) + "\n```"]})
    assert ai.call_json([], ExtractedEnquiry, providers=[DS]).data.interest.value == "bootcamp"


def test_retry_once_on_invalid_json_then_succeed(monkeypatch):
    calls = fake_clients(monkeypatch, {"deepseek": ['{"message_type": "lead"}', json.dumps(VALID)]})
    r = ai.call_json([], ExtractedEnquiry, providers=[DS, GM])
    assert calls == ["deepseek", "deepseek"] and r.model_used.startswith("deepseek") and not r.first_try_valid


def test_fallback_after_two_invalid(monkeypatch):
    calls = fake_clients(monkeypatch, {"deepseek": ["not json", "{}"], "gemini": [json.dumps(VALID)]})
    r = ai.call_json([], ExtractedEnquiry, providers=[DS, GM])
    assert calls == ["deepseek", "deepseek", "gemini"] and r.model_used == "gemini:gemini-x"
    assert len(r.errors) == 2


def test_fallback_on_api_error(monkeypatch):
    err = APITimeoutError(request=httpx.Request("POST", "https://ds"))
    calls = fake_clients(monkeypatch, {"deepseek": [err], "gemini": [json.dumps(VALID)]})
    r = ai.call_json([], ExtractedEnquiry, providers=[DS, GM])
    assert calls == ["deepseek", "gemini"] and r.model_used.startswith("gemini")


def test_all_fail_raises(monkeypatch):
    fake_clients(monkeypatch, {"deepseek": ["x", "y"], "gemini": ["x", "y"]})
    with pytest.raises(ai.AIUnavailable) as e:
        ai.call_json([], ExtractedEnquiry, providers=[DS, GM])
    assert len(e.value.errors) == 4


def test_no_providers_raises():
    with pytest.raises(ai.AIUnavailable):
        ai.call_json([], ExtractedEnquiry, providers=[])
