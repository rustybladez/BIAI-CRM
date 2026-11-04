"""M4 API tests on the seeded in-memory DB. Intake uses a fake AI (no network)."""

import pytest
from fastapi.testclient import TestClient
from sqlmodel import select

from backend.ai.client import AIResult, AIUnavailable
from backend.ai.schema import ExtractedEnquiry
from backend.api import intake
from backend.config import demo_now, parse_local, set_demo_now
from backend.db import Enquiry
from backend.main import app

client = TestClient(app)  # no lifespan: tests seed the in-memory DB themselves


@pytest.fixture(autouse=True)
def restore_clock():
    before = demo_now()
    yield
    set_demo_now(before)


def cid(session, seed_id: int) -> int:
    return session.exec(select(Enquiry).where(Enquiry.seed_id == seed_id)).one().contact_id


def seed_ids(session, items) -> list[int]:
    by_contact = {}
    for e in session.exec(select(Enquiry)).all():
        by_contact.setdefault(e.contact_id, []).append(e.seed_id)
    return sorted(min(by_contact[i["id"]]) for i in items)


# ---- list + filters ----
RANK = {"urgent": 0, "high": 1, "medium": 2, "low": 3}


def test_default_sort_is_priority_then_overdue(seeded):
    items = client.get("/api/contacts").json()
    assert len(items) == 19
    keys = [(RANK[i["priority"]], not i["overdue"]) for i in items]
    assert keys == sorted(keys)  # urgent first; overdue before not overdue within a priority
    new = [i["name"] for i in items if i["status"] == "New"]
    assert new[0] == "Rafi Ahmed"  # urgent, not overdue, beats every overdue medium / low card


def test_overdue_first_sort(seeded):
    items = client.get("/api/contacts?sort=overdue").json()
    keys = [(not i["overdue"], RANK[i["priority"]]) for i in items]
    assert keys == sorted(keys)
    new = [i["name"] for i in items if i["status"] == "New"]
    assert new[0] == "Mahmud Hasan"  # high + overdue
    assert new.index("Ishtiaq") < new.index("Rafi Ahmed")  # low but overdue, above urgent not overdue


def test_ties_go_to_the_longest_wait(seeded):
    items = client.get("/api/contacts").json()
    medium_overdue = [i for i in items if i["priority"] == "medium" and i["overdue"]]
    times = [i["last_inbound_at"] for i in medium_overdue]
    assert times == sorted(times) and len(times) >= 2  # oldest message first


@pytest.mark.parametrize(
    ("query", "expected_seed_ids"),
    [
        ("lane=not_a_lead", [11, 20]),
        ("type=spam", [11]),
        ("status=Paid", [7, 16]),
        ("channel=Phone call note", [5, 16]),
        ("interest=corporate", [3, 10, 18]),
        ("overdue=true", [2, 3, 4, 5, 6, 16]),
        ("priority=urgent", [1, 16]),
        ("channel=WhatsApp&priority=high", [7, 10, 18, 19]),
    ],
)
def test_filters(seeded, query, expected_seed_ids):
    assert seed_ids(seeded, client.get(f"/api/contacts?{query}").json()) == expected_seed_ids


def test_pipeline_lane(seeded):
    assert len(client.get("/api/contacts?lane=pipeline").json()) == 17


@pytest.mark.parametrize("query", ["status=Done", "lane=x", "channel=Email", "type=lead2", "sort=name"])
def test_bad_filters_are_422(seeded, query):
    assert client.get(f"/api/contacts?{query}").status_code == 422


# ---- detail ----
def test_detail_rafi(seeded):
    d = client.get(f"/api/contacts/{cid(seeded, 1)}").json()
    assert [e["seed_id"] for e in d["enquiries"]] == [1, 12]
    assert [a["kind"] for a in d["activities"]] == ["inbound", "inbound", "merge"]
    assert d["enquiries"][0]["received_at"] == "2026-10-26T09:12:00+06:00"  # Dhaka time out
    assert d["enquiries"][0]["extraction"]["interest"] == "bootcamp"
    assert (
        d["reply_draft"]["language"] == "banglish"
        and d["enquiry_count"] == 2
        and d["channels"] == ["WhatsApp"]
    )


def test_detail_404(seeded):
    assert client.get("/api/contacts/999").status_code == 404


# ---- edit ----
def test_patch_status_writes_timeline(seeded):
    c = cid(seeded, 2)
    d = client.patch(f"/api/contacts/{c}", json={"status": "Interested", "note": "Asked for brochure"}).json()
    assert d["status"] == "Interested"
    assert [a["kind"] for a in d["activities"]][-2:] in (["note", "status_change"], ["status_change", "note"])
    assert any(a["body"] == "New → Interested" for a in d["activities"])


def test_patch_fields_clear_low_confidence(seeded):
    c = cid(seeded, 3)
    client.patch(f"/api/contacts/{c}", json={})  # no-op is fine
    from backend.db import Contact

    contact = seeded.get(Contact, c)
    contact.low_confidence_fields = ["company", "team_size"]
    seeded.add(contact)
    seeded.commit()
    d = client.patch(f"/api/contacts/{c}", json={"company": "Gazipur Textiles Ltd"}).json()
    assert d["company"] == "Gazipur Textiles Ltd" and d["low_confidence_fields"] == ["team_size"]


def test_patch_phone(seeded):
    c = cid(seeded, 2)  # Tahmina, no phone
    assert client.patch(f"/api/contacts/{c}", json={"phone": "12"}).status_code == 422
    assert client.patch(f"/api/contacts/{c}", json={"phone": "01711000001"}).status_code == 409  # Rafi's
    d = client.patch(f"/api/contacts/{c}", json={"phone": "+880 1811-000002"}).json()
    assert d["phone"] == "01811000002" and not d["missing_phone"]


def test_patch_follow_up_and_not_a_lead(seeded):
    c = cid(seeded, 9)
    d = client.patch(f"/api/contacts/{c}", json={"follow_up_by": "2026-10-28T10:00"}).json()
    assert d["follow_up_by"] == "2026-10-28T10:00:00+06:00" and d["overdue"]
    assert client.patch(f"/api/contacts/{c}", json={"follow_up_by": "tomorrow"}).status_code == 422
    d = client.patch(f"/api/contacts/{c}", json={"status": None}).json()
    assert d["status"] is None and not d["overdue"]
    d = client.patch(f"/api/contacts/{cid(seeded, 20)}", json={"message_type": "lead"}).json()
    assert d["status"] == "New"  # moved out of the Not-a-lead tray


# ---- follow-ups + clock ----
def test_followups_at_default_clock(seeded):
    f = client.get("/api/followups").json()
    assert f["now"] == "2026-10-28T12:00:00+06:00"
    assert seed_ids(seeded, f["overdue"]) == [2, 3, 4, 5, 6, 16] and f["due_today"] == []


def test_clock_changes_followups(seeded):
    assert client.put("/api/demo/clock", json={"demo_now": "2026-10-27 10:00"}).json() == {
        "demo_now": "2026-10-27T10:00"
    }
    f = client.get("/api/followups").json()
    # 5: "tomorrow after 5 PM" and 16: "today" are both due 27 Oct 17:00; neither is past 48h yet
    assert seed_ids(seeded, f["due_today"]) == [5, 16]
    assert client.get("/api/meta").json()["demo_now"] == "2026-10-27T10:00"
    assert client.put("/api/demo/clock", json={"demo_now": "soon"}).status_code == 422


# ---- intake ----
def fake_ai(monkeypatch, **fields):
    base = dict(
        message_type="lead",
        message_type_reason="x",
        interest="bootcamp",
        language="banglish",
        status="New",
        priority="medium",
        priority_reason="Normal question.",
        summary="Asks about the bootcamp.",
    )
    ex = ExtractedEnquiry.model_validate(base | fields)
    monkeypatch.setattr(intake, "extract_enquiry", lambda *a, **k: AIResult(ex, "fake:model", 42, True))
    return ex


MSG = {
    "channel": "WhatsApp",
    "sender_name": "Rafi Ahmed",
    "phone": "+880 1711-000001",
    "message": "Invented: price?",
}


def test_analyse_previews_merge_and_escalation(seeded, monkeypatch):
    fake_ai(monkeypatch)
    r = client.post("/api/intake/analyse", json=MSG).json()
    assert r["phone"] == "01711000001" and r["model_used"] == "fake:model"
    assert r["duplicate"]["contact_id"] == cid(seeded, 1) and r["duplicate"]["would_escalate"]
    assert len(seeded.exec(select(Enquiry)).all()) == 20  # analyse saves nothing


def test_save_merges(seeded, monkeypatch):
    ex = fake_ai(monkeypatch)
    r = client.post("/api/intake/save", json=MSG | {"extraction": ex.model_dump(mode="json")})
    assert r.status_code == 201 and r.json() == {"contact_id": cid(seeded, 1), "merged": True}
    d = client.get(f"/api/contacts/{cid(seeded, 1)}").json()
    assert d["enquiry_count"] == 3 and d["enquiries"][-1]["received_at"] == "2026-10-28T12:00:00+06:00"


def test_save_new_contact_with_phone_in_message(seeded, monkeypatch):
    ex = fake_ai(monkeypatch, name="Nadia", phone_in_message="০১৯১১২২২৩৩৩")
    msg = {
        "channel": "Facebook Messenger",
        "sender_name": "Nadia",
        "message": "Invented",
        "received_at": "2026-10-28T11:00",
    }
    r = client.post("/api/intake/analyse", json=msg).json()
    assert r["phone"] == "01911222333" and r["duplicate"] is None and r["status"] == "New"
    saved = client.post("/api/intake/save", json=msg | {"extraction": ex.model_dump(mode="json")}).json()
    assert not saved["merged"] and len(client.get("/api/contacts").json()) == 20


def test_analyse_503_when_ai_down(seeded, monkeypatch):
    def down(*a, **k):
        raise AIUnavailable(["deepseek: timeout", "gemini: 503"])

    monkeypatch.setattr(intake, "extract_enquiry", down)
    r = client.post("/api/intake/analyse", json=MSG)
    assert (
        r.status_code == 503
        and r.json()["detail"] == "The AI is not responding right now. Please try again in a minute."
    )


@pytest.mark.parametrize(
    "bad", [{"channel": "Email"}, {"message": ""}, {"received_at": "yesterday"}, {"sender_name": ""}]
)
def test_intake_validation(seeded, bad):
    assert client.post("/api/intake/analyse", json=MSG | bad).status_code == 422


def test_parse_local_is_dhaka():
    assert parse_local("2026-10-28T12:00").utcoffset().total_seconds() == 6 * 3600


def test_reset_restores_demo_clock(seeded):
    client.put("/api/demo/clock", json={"demo_now": "2026-10-26T10:00"})
    client.post("/api/demo/reset")
    assert client.get("/api/meta").json()["demo_now"] == "2026-10-28T12:00"
