"""Seed the DB from enquiries.csv + ai_results.json (pre-generated AI output, no live calls)."""

import json
from pathlib import Path

from sqlmodel import Session, SQLModel, func, select

from backend.ai.schema import ExtractedEnquiry
from backend.config import parse_local
from backend.db import Contact, Enquiry, ReplyDraft
from backend.normalize import ingest
from backend.seed.load import read_enquiries

AI_RESULTS_PATH = Path(__file__).parent / "ai_results.json"
REPLIES_PATH = Path(__file__).parent / "replies.json"


def load_ai_results(path: Path = AI_RESULTS_PATH) -> dict[int, dict]:
    return {item["id"]: item for item in json.loads(path.read_text(encoding="utf-8"))["items"]}


def load_seed_replies(session: Session, path: Path = REPLIES_PATH) -> int:
    """Attach pre-generated reply drafts (eval/run_reply_checks.py --generate) to the seeded contacts.
    Items are keyed by the contact's first sample enquiry id; the contact's own language goes last
    so it is the draft shown by default."""
    if not path.exists():
        return 0
    items = json.loads(path.read_text(encoding="utf-8"))["items"]
    by_seed = {e.seed_id: e for e in session.exec(select(Enquiry).where(Enquiry.seed_id != None)).all()}  # noqa: E711
    count = 0
    for item in sorted(
        items, key=lambda i: (i["seed_id"], i["language"] == by_seed[i["seed_id"]].contact.language)
    ):
        contact = by_seed[item["seed_id"]].contact
        latest = max(contact.enquiries, key=lambda e: (e.received_at, e.id))
        session.add(
            ReplyDraft(
                contact_id=contact.id,
                enquiry_id=latest.id,
                **{k: item[k] for k in ("language", "format", "body", "faq_keys_used", "needs_confirmation")},
                model_used=item.get("model_used"),
                latency_ms=item.get("latency_ms"),
            )
        )
        count += 1
    session.commit()
    return count


def seed(session: Session, with_replies: bool = True) -> int:
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
    if with_replies:
        load_seed_replies(session)
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
