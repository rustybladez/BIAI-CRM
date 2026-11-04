"""
Weekly summary check (PRD M7 "Done when"), on the seeded data at the default demo clock.

    uv run python eval/run_summary_check.py --generate   # call the AI, save backend/seed/summary.json
    uv run python eval/run_summary_check.py              # check the saved summary (no AI call)

Checks: Habibur (#16) and Rafi (#1/#12) are in "chase first"; every number in the text appears in the
code-computed figures; overview is 3-5 sentences; at most 5 chase items, all from the candidate list.
"""

import argparse
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlmodel import Session, SQLModel  # noqa: E402

from backend.ai.schema import WeeklySummary  # noqa: E402
from backend.config import initial_demo_now  # noqa: E402
from backend.db import make_engine  # noqa: E402
from backend.seed.seed import seed  # noqa: E402
from backend.summary import (  # noqa: E402
    SEED_SUMMARY_PATH,
    compute_stats,
    fingerprint,
    generate_summary,
    unverified_numbers_in_summary,
)


def seeded_stats() -> dict:
    engine = make_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    with Session(engine) as session:
        seed(session)
        return compute_stats(session, initial_demo_now())


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--generate", action="store_true")
    args = ap.parse_args()

    stats = seeded_stats()
    if args.generate:
        entry = generate_summary(stats)
        SEED_SUMMARY_PATH.write_text(json.dumps(entry, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(
            f"Saved {SEED_SUMMARY_PATH.relative_to(ROOT)} ({entry['model_used']}, {entry['latency_ms']} ms)"
        )
    entry = json.loads(SEED_SUMMARY_PATH.read_text(encoding="utf-8"))
    s = WeeklySummary.model_validate(entry["summary"])
    names = {p["contact_id"]: p["name"] for p in stats["chase_candidates_ranked"]}
    chase = [names.get(c.contact_id, f"?{c.contact_id}") for c in s.chase_first]
    sentences = len(re.findall(r"[.!?](?:\s|$)", s.overview.strip()))

    checks = {
        "summary matches the seeded data (fingerprint)": entry["fingerprint"] == fingerprint(stats),
        "Habibur Rahman in chase first": "Habibur Rahman" in chase,
        "Rafi Ahmed in chase first": "Rafi Ahmed" in chase,
        "every number is from the computed figures": not unverified_numbers_in_summary(s, stats),
        "overview is 3-5 sentences": 3 <= sentences <= 5,
        "1-5 chase items, all from the candidates": 1 <= len(s.chase_first) <= 5
        and all(n in names.values() for n in chase),
    }
    print("\nOVERVIEW:", s.overview)
    print("\nCHASE FIRST:")
    for c in s.chase_first:
        print(f"  - {names.get(c.contact_id)}: {c.reason}")
    print("\nOBSERVATION:", s.observation)
    print("\nUnverified numbers:", unverified_numbers_in_summary(s, stats) or "none")
    print()
    for name, ok in checks.items():
        print(("PASS " if ok else "FAIL ") + name)
    return 0 if all(checks.values()) else 1


if __name__ == "__main__":
    raise SystemExit(main())
