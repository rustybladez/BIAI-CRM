"""M7: code-computed weekly figures, AI summary checks (fake AI), cache, CSV export."""

import csv
import io
from datetime import datetime

from fastapi.testclient import TestClient
from sqlmodel import select

from backend import summary as sm
from backend.ai.client import AIResult, AIUnavailable
from backend.ai.schema import ChaseItem, WeeklySummary
from backend.config import DHAKA, demo_now
from backend.db import Enquiry
from backend.main import app

client = TestClient(app)


def cid(session, seed_id: int) -> int:
    return session.exec(select(Enquiry).where(Enquiry.seed_id == seed_id)).one().contact_id


def test_week_starts_on_sunday():
    assert sm.week_start(datetime(2026, 10, 28, 12, tzinfo=DHAKA)) == datetime(2026, 10, 25, tzinfo=DHAKA)
    assert sm.week_start(datetime(2026, 10, 25, 9, tzinfo=DHAKA)) == datetime(2026, 10, 25, tzinfo=DHAKA)


def test_stats_on_seeded_data(seeded):
    st = sm.compute_stats(seeded, demo_now())
    assert st["pipeline_total"] == 17 and st["pipeline_by_status"]["New"] == 15
    assert st["pipeline_by_status"]["Paid"] == 2
    assert st["not_a_lead"] == {"spam": 1, "irrelevant": 1}
    assert st["this_week"] == {"messages_received": 20, "new_contacts": 19, "replies_sent": 0}
    assert st["corporate"]["leads"] == 3 and st["corporate"]["total_people_to_train"] == 175
    assert st["overdue_count"] == 6 and st["urgent_count"] == 2 and st["missing_phone"] == 5
    first_two = [p["name"] for p in st["chase_candidates_ranked"][:2]]
    assert first_two == ["Habibur Rahman", "Rafi Ahmed"]  # urgent first, overdue before not overdue


def _fake_ai(monkeypatch, *summaries: WeeklySummary):
    queue = list(summaries)
    calls = []

    def fake(messages, model_cls, **kw):
        calls.append(messages)
        return AIResult(queue.pop(0), "fake:m", 5, True)

    monkeypatch.setattr(sm, "call_json", fake)
    return calls


def test_generate_keeps_only_candidates_and_retries_invented_numbers(seeded, monkeypatch):
    st = sm.compute_stats(seeded, demo_now())
    ids = [p["contact_id"] for p in st["chase_candidates_ranked"]]
    bad = WeeklySummary(
        overview="We got 99 messages.",
        chase_first=[ChaseItem(contact_id=i, reason="x") for i in [999, ids[0], ids[0], *ids[1:7]]],
        observation="ok",
    )
    good = bad.model_copy(update={"overview": "We got 20 messages."})
    calls = _fake_ai(monkeypatch, bad, good)
    entry = sm.generate_summary(st)
    assert len(calls) == 2 and "99" in calls[1][-1]["content"]
    assert entry["unverified_numbers"] == [] and entry["summary"]["overview"] == "We got 20 messages."
    chase = [c["contact_id"] for c in entry["summary"]["chase_first"]]
    assert chase == ids[:5]  # unknown id dropped, duplicate dropped, capped at 5


def test_seeded_summary_is_served_without_ai(seeded, monkeypatch):
    calls = _fake_ai(monkeypatch)
    r = client.get("/api/summary/weekly").json()
    assert r["summary"] is not None and calls == []
    names = [c["name"] for c in r["summary"]["chase_first"]]
    assert "Habibur Rahman" in names and "Rafi Ahmed" in names
    assert r["summary"]["unverified_numbers"] == []


def test_summary_disappears_when_data_changes_and_regenerates(seeded, monkeypatch):
    client.post(f"/api/contacts/{cid(seeded, 1)}/reply/sent", json={})
    assert client.get("/api/summary/weekly").json()["summary"] is None  # figures changed
    st = client.get("/api/summary/weekly").json()["stats"]
    first = st["chase_candidates_ranked"][0]["contact_id"]
    _fake_ai(
        monkeypatch,
        WeeklySummary(
            overview="A. B. C.", chase_first=[ChaseItem(contact_id=first, reason="r")], observation="o"
        ),
    )
    r = client.post("/api/summary/weekly").json()
    assert r["summary"]["chase_first"][0]["contact_id"] == first
    assert client.get("/api/summary/weekly").json()["summary"] is not None  # cached now


def test_summary_ai_down_still_returns_figures(seeded, monkeypatch):
    def down(*a, **k):
        raise AIUnavailable(["deepseek: 503"])

    monkeypatch.setattr(sm, "call_json", down)
    r = client.post("/api/summary/weekly").json()
    assert r["summary"] is None and "not responding" in r["error"] and r["stats"]["pipeline_total"] == 17


def test_export_csv(seeded):
    r = client.get("/api/export.csv")
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/csv")
    assert "attachment" in r.headers["content-disposition"]
    text = r.content.decode("utf-8")
    assert text.startswith("﻿")  # BOM: Excel shows Bangla correctly
    rows = list(csv.DictReader(io.StringIO(text.lstrip("﻿"))))
    assert len(rows) == 19
    assert sum(r["status"] == "Not a lead" for r in rows) == 2
    assert sum(r["overdue"] == "yes" for r in rows) == 6


def test_this_week_counts_stop_at_the_demo_clock(seeded):
    st = sm.compute_stats(seeded, datetime(2026, 10, 26, 10, 0, tzinfo=DHAKA))
    assert st["this_week"] == {"messages_received": 2, "new_contacts": 2, "replies_sent": 0}  # #1, #2 only


def test_ai_error_never_leaks_provider_text(seeded, monkeypatch):
    def down(*a, **k):
        raise AIUnavailable(["deepseek: AuthenticationError: Your api key: ****abcd is invalid"])

    monkeypatch.setattr(sm, "call_json", down)
    assert "abcd" not in client.post("/api/summary/weekly").json()["error"]
