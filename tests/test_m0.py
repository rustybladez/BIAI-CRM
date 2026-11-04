from fastapi.testclient import TestClient

from backend.main import app
from backend.seed.load import read_enquiries


def test_meta():
    data = TestClient(app).get("/api/meta").json()
    assert data["statuses"] == ["New", "Contacted", "Interested", "Paid", "Lost"]
    assert data["demo_now"] == "2026-10-28T12:00"


def test_csv_reads_all_rows_despite_bom():
    rows = read_enquiries()
    assert [r.id for r in rows] == list(range(1, 21))
    assert sum(r.phone is None for r in rows) == 6
    assert rows[6].message.startswith("পেমেন্ট")


def test_health():
    data = TestClient(app).get("/api/health").json()
    assert data["ok"] and data["boot_count"] >= 1
