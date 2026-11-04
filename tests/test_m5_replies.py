"""M5: reply format/ask-for rules, number guard, draft checks, seeded drafts, reply endpoints."""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from backend.ai import replies as rp
from backend.ai.client import AIResult, AIUnavailable
from backend.ai.prompts import REPLY_SYSTEM
from backend.ai.schema import SuggestedReply
from backend.db import Enquiry
from backend.main import app
from backend.seed.load import read_enquiries

client = TestClient(app)


def cid(session, seed_id: int) -> int:
    return session.exec(select(Enquiry).where(Enquiry.seed_id == seed_id)).one().contact_id


# ---- rules ----
@pytest.mark.parametrize(
    ("message_type", "channel", "fmt"),
    [
        ("spam", "Facebook comment", "none"),
        ("lead", "Facebook comment", "public_comment"),
        ("complaint", "Phone call note", "call_script"),
        ("irrelevant", "Website form", "text"),
        ("support", "WhatsApp", "text"),
    ],
)
def test_reply_format(message_type, channel, fmt):
    assert rp.reply_format(message_type, channel).value == fmt


def test_ask_for():
    text, public = rp.ReplyFormat.text, rp.ReplyFormat.public_comment
    assert rp.ask_for(["which program"], True, text, []) == [
        "which program",
        "a phone number we can call or WhatsApp",
    ]
    assert rp.ask_for(["phone number"], True, text, []) == [
        "a phone number we can call or WhatsApp"
    ]  # no duplicate
    assert rp.ask_for(["which program"], True, public, []) == []  # never in public
    assert rp.ask_for(["phone number"], True, text, ["minor"]) == []  # never from a minor


def test_number_guard():
    assert rp.numbers_in("Fee ৳৮,৫০০, 2 instalments, 10% off.") == {"8500", "2", "10"}
    customer = ["Can someone call me after 5 PM? We are 40 people."]
    assert rp.unverified_numbers("Fee 8,500 taka, call after 5 PM for 40 people.", customer) == []
    assert rp.unverified_numbers("Fee 9,000 taka, starts 17 March.", customer) == ["17", "9000"]
    # Known limit: numbers are checked one by one, so a wrong "3" passes because the FAQ has "3-day".
    assert rp.unverified_numbers("Starts 3 March.", customer) == []


def test_draft_warnings():
    assert rp.draft_warnings("Ji, recording 6 months thake.", "banglish", "text", []) == []
    assert rp.draft_warnings("এটি онлайн ক্লাস", "bangla", "text", [])[0].startswith(
        "Contains letters from another"
    )
    assert rp.draft_warnings("Hello there", "bangla", "text", []) == ["Should be in Bangla script"]
    assert rp.draft_warnings("A. B. C.", "english", "public_comment", []) == [
        "Public comment is longer than 2 sentences"
    ]
    assert rp.draft_warnings("", "english", "none", []) == []


def test_faq_is_marked_placeholder_and_reply_prompt_has_no_samples():
    import yaml

    data = yaml.safe_load(rp.FAQ_PATH.read_text(encoding="utf-8"))
    assert data["placeholder"] is True and "certificate" in data["entries"]
    assert "NOT a government" in data["entries"]["certificate"]["answer"]
    for row in read_enquiries():
        assert row.message not in REPLY_SYSTEM


# ---- seeded drafts ----
def test_every_seeded_contact_has_a_draft_in_its_language(seeded):
    for item in client.get("/api/contacts").json():
        d = client.get(f"/api/contacts/{item['id']}").json()["reply_draft"]
        assert d is not None and d["language"] == item["language"], item["name"]
        assert not d["check_before_sending"], (item["name"], d["warnings"])


@pytest.mark.parametrize(
    ("seed_id", "fmt"), [(11, "none"), (16, "call_script"), (6, "public_comment"), (7, "text")]
)
def test_seeded_draft_formats(seeded, seed_id, fmt):
    d = client.get(f"/api/contacts/{cid(seeded, seed_id)}").json()["reply_draft"]
    assert d["format"] == fmt and (d["body"] == "") == (fmt == "none")


# ---- endpoints ----
def fake_reply(monkeypatch, body: str):
    calls = []

    def fake(messages, model_cls, **kw):
        calls.append(messages)
        return AIResult(SuggestedReply(body=body, faq_keys_used=["bootcamp", "nonsense"]), "fake:m", 7, True)

    monkeypatch.setattr(rp, "call_json", fake)
    return calls


def test_language_switch_uses_saved_draft_without_ai(seeded, monkeypatch):
    calls = fake_reply(monkeypatch, "should not be used")
    c = cid(seeded, 1)
    english = client.post(f"/api/contacts/{c}/reply", json={"language": "english"}).json()
    assert english["language"] == "english" and english["body"] != "should not be used"
    assert client.get(f"/api/contacts/{c}").json()["reply_draft"]["language"] == "english"  # now shown
    back = client.post(f"/api/contacts/{c}/reply", json={}).json()  # default = customer's language
    assert back["language"] == "banglish" and calls == []


def test_regenerate_calls_ai_and_drops_unknown_faq_keys(seeded, monkeypatch):
    calls = fake_reply(monkeypatch, "Ji, bootcamp fee 8,500 taka.")
    d = client.post(f"/api/contacts/{cid(seeded, 1)}/reply", json={"regenerate": True}).json()
    assert len(calls) == 1 and d["body"] == "Ji, bootcamp fee 8,500 taka." and d["model_used"] == "fake:m"
    assert d["faq_keys_used"] == ["bootcamp"] and not d["check_before_sending"]


def test_invented_number_is_flagged_after_one_rewrite(seeded, monkeypatch):
    calls = fake_reply(monkeypatch, "Ji, bootcamp fee 7,000 taka.")
    d = client.post(f"/api/contacts/{cid(seeded, 1)}/reply", json={"regenerate": True}).json()
    assert len(calls) == 2  # first draft + one rewrite asking to fix the number
    assert "7000" in calls[1][-1]["content"]
    assert d["unverified_numbers"] == ["7000"] and d["check_before_sending"]


def test_spam_reply_needs_no_ai(seeded, monkeypatch):
    calls = fake_reply(monkeypatch, "x")
    d = client.post(f"/api/contacts/{cid(seeded, 11)}/reply", json={"regenerate": True}).json()
    assert d["format"] == "none" and d["body"] == "" and calls == []


def test_reply_503_when_ai_down(seeded, monkeypatch):
    def down(*a, **k):
        raise AIUnavailable(["deepseek: 429"])

    monkeypatch.setattr(rp, "call_json", down)
    r = client.post(f"/api/contacts/{cid(seeded, 1)}/reply", json={"regenerate": True})
    assert r.status_code == 503


def test_mark_sent(seeded):
    c = cid(seeded, 1)  # Rafi: New, urgent
    d = client.post(f"/api/contacts/{c}/reply/sent", json={}).json()
    assert d["status"] == "Contacted" and not d["awaiting_reply"]
    sent = [a for a in d["activities"] if a["kind"] == "reply_sent"]
    assert len(sent) == 1 and sent[0]["body"]  # logged the draft that was sent

    habibur = cid(seeded, 16)
    assert client.get(f"/api/contacts/{habibur}").json()["overdue"]
    d = client.post(f"/api/contacts/{habibur}/reply/sent", json={"body": "Called him back"}).json()
    assert not d["overdue"] and d["status"] == "Paid"
