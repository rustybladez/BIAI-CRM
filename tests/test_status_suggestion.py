"""AI status suggestion: offered only when a message merges into a Contacted/Interested contact,
never applied without a click. All messages here are invented (never the 20 samples)."""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlmodel import select

from backend.ai.client import AIResult
from backend.ai.schema import ExtractedEnquiry
from backend.api import intake
from backend.db import Activity, Enquiry, create_tables
from backend.main import app

client = TestClient(app)
RAFI_PHONE = "01711000001"  # seeded contact (enquiries #1 and #12), status New after seeding


def fake_ai(monkeypatch, **fields) -> ExtractedEnquiry:
    base = dict(
        message_type="lead",
        message_type_reason="x",
        interest="bootcamp",
        language="banglish",
        status="New",
        priority="high",
        priority_reason="Buying signal.",
        summary="x",
    )
    ex = ExtractedEnquiry.model_validate(base | fields)
    monkeypatch.setattr(intake, "extract_enquiry", lambda *a, **k: AIResult(ex, "fake:model", 1, True))
    return ex


def rafi_id(session) -> int:
    return session.exec(select(Enquiry).where(Enquiry.seed_id == 1)).one().contact_id


def set_status(cid: int, status: str) -> None:
    assert client.patch(f"/api/contacts/{cid}", json={"status": status}).status_code == 200


def paste(message: str) -> dict:
    return {"channel": "WhatsApp", "phone": RAFI_PHONE, "message": message}


def test_merge_into_contacted_offers_suggestion_but_does_not_apply_it(seeded, monkeypatch):
    cid = rafi_id(seeded)
    set_status(cid, "Contacted")
    msg = paste("Invented: ok vai, bKash number ta den, ami aj e pay kore dicchi")
    ex = fake_ai(monkeypatch, suggested_status="Interested")

    preview = client.post("/api/intake/analyse", json=msg).json()["duplicate"]
    assert preview["contact_id"] == cid and preview["suggested_status"] == "Interested"

    client.post("/api/intake/save", json=msg | {"extraction": ex.model_dump(mode="json")})
    d = client.get(f"/api/contacts/{cid}").json()
    assert d["status"] == "Contacted" and d["suggested_status"] == "Interested"  # not applied

    set_status(cid, "Interested")  # the panel chip's "Move" is this PATCH
    d = client.get(f"/api/contacts/{cid}").json()
    assert d["status"] == "Interested" and d["suggested_status"] is None
    assert d["activities"][-1]["body"] == "Contacted → Interested"


def test_move_clicked_in_merge_preview_applies_on_save(seeded, monkeypatch):
    cid = rafi_id(seeded)
    set_status(cid, "Interested")
    msg = paste("Invented: payment done vai, 5000 taka bKash korlam")
    ex = fake_ai(monkeypatch, suggested_status="Paid", status="Paid", flags=["payment_unverified"])
    body = msg | {"extraction": ex.model_dump(mode="json"), "apply_suggested_status": True}
    assert client.post("/api/intake/save", json=body).json() == {"contact_id": cid, "merged": True}
    d = client.get(f"/api/contacts/{cid}").json()
    assert d["status"] == "Paid" and d["suggested_status"] is None


@pytest.mark.parametrize(
    ("current", "suggested"),
    [
        ("New", "Interested"),  # first reply not sent yet: no prior conversation, no chip
        ("Paid", "Lost"),  # only Contacted / Interested contacts get suggestions
        ("Interested", "Interested"),  # already there
        ("Contacted", "New"),  # not a value the AI may suggest
        ("Contacted", "Contacted"),
    ],
)
def test_no_suggestion_outside_the_rule(seeded, monkeypatch, current, suggested):
    cid = rafi_id(seeded)
    if current != "New":
        set_status(cid, current)
    msg = paste("Invented: thik ache")
    ex = fake_ai(monkeypatch, suggested_status=suggested)
    assert client.post("/api/intake/analyse", json=msg).json()["duplicate"]["suggested_status"] is None
    client.post("/api/intake/save", json=msg | {"extraction": ex.model_dump(mode="json")})
    d = client.get(f"/api/contacts/{cid}").json()
    assert d["status"] == current and d["suggested_status"] is None


def test_lost_suggestion_can_be_dismissed(seeded, monkeypatch):
    cid = rafi_id(seeded)
    set_status(cid, "Contacted")
    msg = paste("Invented: dhonnobad vai, ami onno jaygay bhorti hoye gechi")
    ex = fake_ai(monkeypatch, suggested_status="Lost")
    client.post("/api/intake/save", json=msg | {"extraction": ex.model_dump(mode="json")})
    assert client.get(f"/api/contacts/{cid}").json()["suggested_status"] == "Lost"
    d = client.patch(f"/api/contacts/{cid}", json={"dismiss_suggestion": True}).json()
    assert d["status"] == "Contacted" and d["suggested_status"] is None
    assert not seeded.exec(
        select(Activity).where(Activity.kind == "status_change", Activity.body.contains("Lost"))
    ).all()


def test_later_message_without_a_signal_clears_the_suggestion(seeded, monkeypatch):
    cid = rafi_id(seeded)
    set_status(cid, "Contacted")
    for suggested, expected in [("Interested", "Interested"), (None, None)]:
        ex = fake_ai(monkeypatch, suggested_status=suggested)
        client.post("/api/intake/save", json=paste("Invented") | {"extraction": ex.model_dump(mode="json")})
        assert client.get(f"/api/contacts/{cid}").json()["suggested_status"] == expected


def test_existing_db_gets_the_new_column(tmp_path):
    eng = create_engine(f"sqlite:///{tmp_path / 'old.db'}")
    with eng.begin() as conn:  # a contact table from before suggested_status existed
        conn.execute(text("CREATE TABLE contact (id INTEGER PRIMARY KEY, name VARCHAR)"))
    create_tables(eng)
    assert "suggested_status" in {c["name"] for c in inspect(eng).get_columns("contact")}
    create_tables(eng)  # second boot: no error
