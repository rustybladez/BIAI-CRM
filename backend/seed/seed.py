"""Seed the DB from enquiries.csv + ai_results.json (pre-generated AI output, no live calls)."""

import json
from pathlib import Path

from sqlmodel import Session, SQLModel, func, select

from backend.ai.schema import ExtractedEnquiry
from backend.config import parse_local
from backend.db import Contact
from backend.normalize import ingest
from backend.seed.load import read_enquiries

AI_RESULTS_PATH = Path(__file__).parent / "ai_results.json"


def load_ai_results(path: Path = AI_RESULTS_PATH) -> dict[int, dict]:
    return {item["id"]: item for item in json.loads(path.read_text(encoding="utf-8"))["items"]}


def seed(session: Session) -> int:
    """Ingest every sample enquiry in time order (so merges and escalation happen as in real life)."""
    results = load_ai_results()
    rows = sorted(read_enquiries(), key=lambda r: (parse_local(r.received_at), r.id))
    missing = [r.id for r in rows if r.id not in results]
    if missing:
        raise RuntimeError(f"ai_results.json has no extraction for enquiries {missing}; run eval/run_eval.py")
    for row in rows:
        res = results[row.id]
        ingest(
            session,
            channel=row.channel,
            received_at=parse_local(row.received_at),
            sender_name=row.sender_name,
            phone_raw=row.phone,
            message=row.message,
            extraction=ExtractedEnquiry.model_validate(res["extraction"]),
            model_used=res.get("model_used"),
            latency_ms=res.get("latency_ms"),
            seed_id=row.id,
        )
    session.commit()
    return len(rows)


def seed_if_empty(session: Session) -> bool:
    if session.exec(select(func.count()).select_from(Contact)).one() > 0:
        return False
    seed(session)
    return True


def reset(session: Session) -> int:
    """Drop everything and reseed (demo reset)."""
    engine = session.get_bind()
    session.close()
    SQLModel.metadata.drop_all(engine)
    SQLModel.metadata.create_all(engine)
    with Session(engine) as fresh:
        return seed(fresh)
