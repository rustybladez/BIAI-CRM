"""PRD §10.3 code tests: phone normalisation, merge, missing phone, overdue, reseed."""

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from backend.ai.schema import ExtractedEnquiry
from backend.config import parse_local
from backend.db import Activity, Contact, Enquiry
from backend.main import app
from backend.normalize import (
    DUPLICATE_MERGED,
    REPEAT_NO_REPLY,
    ingest,
    intake_status,
    is_overdue,
    mark_sent,
    normalize_phone,
)

NOW = parse_local("2026-10-28T12:00")  # demo clock
GOLD = {i["id"]: i for i in json.loads(Path("eval/gold.json").read_text(encoding="utf-8"))["items"]}


def contact_for(session, seed_id: int) -> Contact:
    return session.exec(select(Enquiry).where(Enquiry.seed_id == seed_id)).one().contact


@pytest.mark.parametrize(
    "raw", ["০১৭১১০০০০০১", "+8801711000001", "01711-000001", "8801711000001", "01711 000 001"]
)
def test_phone_normalisation(raw):
    assert normalize_phone(raw) == "01711000001"


@pytest.mark.parametrize("raw", [None, "", "12345", "01211000001", "017110000012"])
def test_invalid_phone(raw):
    assert normalize_phone(raw) is None


def test_reseed_gives_19_contacts_from_20_messages(seeded):
    assert len(seeded.exec(select(Contact)).all()) == 19
    assert len(seeded.exec(select(Enquiry)).all()) == 20


def test_rafi_merged_and_urgent(seeded):
    rafi = contact_for(seeded, 1)
    assert rafi is contact_for(seeded, 12)
    assert rafi.phone == "01711000001" and len(rafi.enquiries) == 2
    assert rafi.priority == "urgent" and rafi.priority_reason == "Asked again, no reply yet."
    assert REPEAT_NO_REPLY in rafi.flags and DUPLICATE_MERGED in rafi.flags
    assert [a.kind for a in sorted(rafi.activities, key=lambda a: (a.at, a.id))] == [
        "inbound",
        "inbound",
        "merge",
    ]


def test_missing_phone_count(seeded):
    missing = seeded.exec(select(Contact).where(Contact.missing_phone)).all()
    assert len(missing) == 6
    assert all(c.phone is None for c in missing)


def test_spam_and_job_seeker_out_of_pipeline(seeded):
    out = seeded.exec(select(Contact).where(Contact.status == None)).all()  # noqa: E711
    assert sorted(c.message_type for c in out) == ["irrelevant", "spam"]
    assert len(seeded.exec(select(Contact).where(Contact.status != None)).all()) == 17  # noqa: E711


def test_gold_system_expectations(seeded):
    """Every system_expected value in eval/gold.json, checked against the seeded DB."""
    for i, item in GOLD.items():
        exp, c = item["system_expected"], contact_for(seeded, i)
        assert c.phone == exp.get("normalized_phone"), i
        assert c.missing_phone == exp.get("missing_phone", False), i
        if exp.get("duplicate_of"):
            assert c is contact_for(seeded, exp["duplicate_of"]), i
        if exp.get("priority_after_merge"):
            assert c.priority == exp["priority_after_merge"], i


def test_overdue_at_demo_clock(seeded):
    first_seed = {}
    for e in seeded.exec(select(Enquiry)).all():
        first_seed[e.contact_id] = min(first_seed.get(e.contact_id, e.seed_id), e.seed_id)
    overdue = sorted(first_seed[c.id] for c in seeded.exec(select(Contact)).all() if is_overdue(c, NOW))
    # 16: follow-up "today" (27 Oct 17:00) passed; 5: "tomorrow after 5 PM" passed;
    # 2, 3, 4, 6: unanswered for > 48h. 1 (Rafi): his second message on 27 Oct does not restart the
    # clock, he has waited since Mon 09:12 (50.8 h). 7 (Farzana) wrote at 12:48, so 47.2 h: not yet.
    assert overdue == [1, 2, 3, 4, 5, 6, 16]


def test_rafi_waits_since_his_first_unanswered_message(seeded):
    from backend.normalize import waiting_since

    rafi = contact_for(seeded, 1)
    assert waiting_since(rafi) == parse_local("2026-10-26T09:12")
    assert is_overdue(rafi, NOW)
    mark_sent(seeded, rafi, NOW)
    assert waiting_since(rafi) is None and not is_overdue(rafi, NOW)


def test_48h_rule_applies_to_every_status_except_lost(seeded):
    later = parse_local("2026-10-30T16:00")
    pipeline = [c for c in seeded.exec(select(Contact)).all() if c.status]
    assert len(pipeline) == 17 and all(is_overdue(c, later) for c in pipeline)  # incl. Farzana (Paid)
    farzana = contact_for(seeded, 7)
    assert farzana.status == "Paid" and is_overdue(farzana, later)
    farzana.status = "Lost"
    assert not is_overdue(farzana, later)


def test_contacted_contact_who_writes_again_becomes_overdue(session):
    c, _ = _ingest(session, "2026-10-26T09:00")
    mark_sent(session, c, parse_local("2026-10-26T10:00"))
    assert c.status == "Contacted" and not is_overdue(
        c, parse_local("2026-10-30T10:00")
    )  # ball in their court
    _ingest(session, "2026-10-27T09:00")  # they write again
    assert not is_overdue(c, parse_local("2026-10-29T08:59"))
    assert is_overdue(c, parse_local("2026-10-29T09:01"))  # 48 h after the new, unanswered message


def test_mark_sent_clears_overdue_and_moves_new_to_contacted(seeded):
    habibur = contact_for(seeded, 16)
    assert is_overdue(habibur, NOW)
    mark_sent(seeded, habibur, NOW, "Called back")
    assert not is_overdue(habibur, NOW) and habibur.status == "Paid"  # Paid stays Paid

    tahmina = contact_for(seeded, 2)
    mark_sent(seeded, tahmina, NOW)
    seeded.commit()
    assert tahmina.status == "Contacted" and not is_overdue(tahmina, NOW)
    kinds = [a.kind for a in seeded.exec(select(Activity).where(Activity.contact_id == tahmina.id)).all()]
    assert kinds == ["inbound", "reply_sent", "status_change"]


def _ex(**kw) -> ExtractedEnquiry:
    base = dict(
        message_type="lead",
        message_type_reason="x",
        interest="bootcamp",
        language="english",
        status="New",
        priority="medium",
        priority_reason="x",
        summary="x",
    )
    return ExtractedEnquiry.model_validate(base | kw)


def _ingest(session, when: str, phone: str | None = "01811111111", **kw):
    return ingest(
        session,
        channel="WhatsApp",
        received_at=parse_local(when),
        sender_name="Test",
        phone_raw=phone,
        message="invented test message",
        extraction=_ex(**kw),
    )


def test_no_escalation_when_we_replied_in_between(session):
    c, merged = _ingest(session, "2026-10-26T09:00")
    assert not merged
    mark_sent(session, c, parse_local("2026-10-26T10:00"))
    c2, merged = _ingest(session, "2026-10-27T09:00")
    assert merged and c2 is c
    assert c.priority == "medium" and REPEAT_NO_REPLY not in c.flags


def test_contacts_without_phone_are_not_merged(session):
    a, _ = _ingest(session, "2026-10-26T09:00", phone=None)
    b, merged = _ingest(session, "2026-10-26T10:00", phone=None)
    assert not merged and a is not b and a.missing_phone


def test_phone_from_message_is_used_when_field_empty(session):
    c, _ = _ingest(session, "2026-10-26T09:00", phone=None, phone_in_message="+880 1911-222333")
    assert c.phone == "01911222333" and not c.missing_phone


def test_ai_can_only_set_new_or_paid():
    assert intake_status(_ex(status="Contacted")) == "New"
    assert intake_status(_ex(status="Paid")) == "Paid"
    assert intake_status(_ex(message_type="spam", interest="not_applicable", status=None)) is None


def test_reset_endpoint_and_seed_on_startup():
    with TestClient(app) as client:  # runs lifespan: create tables + seed if empty
        assert client.post("/api/demo/reset").json() == {"enquiries": 20}
        assert client.post("/api/demo/reset").json() == {"enquiries": 20}  # idempotent
    from sqlmodel import Session

    from backend.db import engine

    with Session(engine) as s:
        assert len(s.exec(select(Contact)).all()) == 19


def test_same_minute_reply_then_new_message_is_still_unanswered(seeded):
    """Frozen demo clock: a reply marked sent and a new message saved in the same minute share a timestamp.
    Event order decides: the message saved after the reply is unanswered."""
    from backend.normalize import awaiting_reply, no_reply_since_last_message, waiting_since

    rafi = contact_for(seeded, 1)
    mark_sent(seeded, rafi, NOW)  # 2026-10-28T12:00
    seeded.commit()
    assert not awaiting_reply(rafi) and waiting_since(rafi) is None
    assert not no_reply_since_last_message(rafi)

    again, merged = _ingest(seeded, "2026-10-28T12:00", phone="01711000001")
    seeded.commit()
    assert merged and again is rafi
    assert awaiting_reply(rafi)
    assert waiting_since(rafi) == NOW  # 12:00, not Monday: we replied in between
    assert no_reply_since_last_message(rafi)
