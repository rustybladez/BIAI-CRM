"""
Score AI extraction against eval/gold.json (PRD §10.1).

    uv run python eval/run_eval.py                    # all 20, normal routing (DeepSeek -> Gemini)
    uv run python eval/run_eval.py --model gemini     # one provider only, no fallback
    uv run python eval/run_eval.py --ids 2,7,13,18    # e.g. Bangla-script rows only
    uv run python eval/run_eval.py --no-save          # don't touch ai_results.json / report.md

Writes backend/seed/ai_results.json (seed data for the app) and eval/report.md.
"""

import argparse
import json
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from backend.ai.client import AIUnavailable, configured_providers  # noqa: E402
from backend.ai.extract import extract_enquiry  # noqa: E402
from backend.ai.schema import ExtractedEnquiry, GoldItem, Priority  # noqa: E402
from backend.config import DHAKA, parse_local  # noqa: E402
from backend.seed.load import SeedRow, read_enquiries  # noqa: E402

GOLD_PATH = ROOT / "eval" / "gold.json"
RESULTS_PATH = ROOT / "backend" / "seed" / "ai_results.json"
REPORT_PATH = ROOT / "eval" / "report.md"

PRIORITY_ORDER = [Priority.low, Priority.medium, Priority.high, Priority.urgent]

# Scored fields, in table order, with PRD §10.1 targets as fractions of the rows scored.
TARGETS: dict[str, float] = {
    "message_type": 19 / 20,
    "language": 19 / 20,
    "status": 19 / 20,
    "interest": 17 / 20,
    "priority (±1)": 18 / 20,
    "name": 18 / 20,
    "follow_up_by date": 1.0,
    "flags recall": 0.85,
    "valid JSON first try": 19 / 20,
}
# Reported, no target.
INFO_FIELDS = ["priority (exact)", "team_size", "role", "company"]


def load_gold() -> dict[int, GoldItem]:
    data = json.loads(GOLD_PATH.read_text(encoding="utf-8"))
    return {item["id"]: GoldItem.model_validate(item) for item in data["items"]}


def _norm(v: object) -> object:
    if hasattr(v, "value"):
        v = v.value
    return v.strip().casefold() if isinstance(v, str) else v


def score_item(gold: GoldItem, got: ExtractedEnquiry | None, first_try_valid: bool) -> dict:
    """Per-field result: {field: (ok | None, expected, got)}; ok=None means not scored for this row.
    Flags are returned as ('flags', hits, expected_count, missing, extra)."""
    exp = gold.expected
    out: dict[str, tuple] = {}
    if got is None:
        # Count the call as wrong on every field this row is scored on, and nothing else.
        out = score_item(gold, exp, False)
        for f, val in out.items():
            if f == "flags":
                out[f] = (0, val[1], val[2] + val[3], [])
            elif val[0] is not None:
                out[f] = (False, val[1], "AI call failed")
        out["failed"] = True
        return out

    for f in ["message_type", "language", "status", "interest", "name"]:
        e, g = getattr(exp, f), getattr(got, f)
        out[f] = (_norm(e) == _norm(g), e, g)

    pe, pg = PRIORITY_ORDER.index(exp.priority), PRIORITY_ORDER.index(got.priority)
    out["priority (±1)"] = (abs(pe - pg) <= 1, exp.priority, got.priority)
    out["priority (exact)"] = (pe == pg, exp.priority, got.priority)

    if exp.follow_up_by:
        ok = bool(got.follow_up_by) and got.follow_up_by[:10] == exp.follow_up_by[:10]
        out["follow_up_by date"] = (ok, exp.follow_up_by, got.follow_up_by)
    else:
        # Not scored, but an invented deadline is worth seeing in the mismatch list.
        out["follow_up_by date"] = (None, None, got.follow_up_by)

    for f in ["team_size", "role", "company"]:
        e = getattr(exp, f)
        out[f] = (
            (_norm(e) == _norm(getattr(got, f)), e, getattr(got, f)) if e is not None else (None, e, None)
        )

    out["valid JSON first try"] = (first_try_valid, True, first_try_valid)

    e_flags = {f.value for f in exp.flags}
    g_flags = {f.value for f in got.flags}
    out["flags"] = (
        len(e_flags & g_flags),
        len(e_flags),
        sorted(e_flags - g_flags),
        sorted(g_flags - e_flags),
    )
    return out


def summarise(scores: dict[int, dict]) -> list[tuple[str, int, int, float | None, bool | None]]:
    """Rows of (field, correct, scored, target, met)."""
    rows = []
    for f in [*TARGETS, *INFO_FIELDS]:
        if f == "flags recall":
            hits = sum(s["flags"][0] for s in scores.values())
            total = sum(s["flags"][1] for s in scores.values())
            rows.append((f, hits, total, TARGETS[f], (hits / total >= TARGETS[f]) if total else None))
            continue
        results = [s[f][0] for s in scores.values() if s[f][0] is not None]
        correct, n = sum(results), len(results)
        target = TARGETS.get(f)
        met = None if target is None or n == 0 else correct / n >= target - 1e-9
        rows.append((f, correct, n, target, met))
    return rows


def mismatches(scores: dict[int, dict], rows: dict[int, SeedRow]) -> list[str]:
    lines = []
    for i, s in sorted(scores.items()):
        if s.get("failed"):
            lines.append(f"| {i} | all fields | (valid output) | AI call failed |")
            continue
        for f, val in s.items():
            if f == "flags":
                _, _, missing, extra = val
                if missing:
                    lines.append(f"| {i} | flags | missing {missing} | extra {extra} |")
                continue
            ok, e, g = val
            if ok is False or (f == "follow_up_by date" and ok is None and g):
                if f == "priority (exact)" and s["priority (±1)"][0]:
                    continue  # within one level: counted as correct, not a mismatch
                label = f + (" (not expected)" if ok is None else "")
                lines.append(f"| {i} | {label} | {_norm(e)} | {_norm(g)} |")
    return lines


def system_checks(gold: dict[int, GoldItem], rows: dict[int, SeedRow], results: dict[int, dict]) -> list[str]:
    """Run the code-side rules (normalize.py) over these AI results in a throwaway DB and compare
    with system_expected. Returns failure lines; empty means 100%. Needs all 20 rows (merges)."""
    from sqlmodel import Session, SQLModel, select

    from backend.db import Enquiry, make_engine
    from backend.normalize import ingest

    engine = make_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    fails = []
    with Session(engine) as session:
        for row in sorted(rows.values(), key=lambda r: (parse_local(r.received_at), r.id)):
            ex = ExtractedEnquiry.model_validate(results[row.id]["extraction"])
            ingest(
                session,
                channel=row.channel,
                received_at=parse_local(row.received_at),
                sender_name=row.sender_name,
                phone_raw=row.phone,
                message=row.message,
                extraction=ex,
                seed_id=row.id,
            )
        session.commit()
        contact = {e.seed_id: e.contact for e in session.exec(select(Enquiry)).all()}
        for i, g in gold.items():
            exp, c = g.system_expected, contact[i]
            checks = {
                "normalized_phone": (exp.normalized_phone, c.phone),
                "missing_phone": (exp.missing_phone, c.missing_phone),
            }
            if exp.duplicate_of:
                checks["duplicate_of"] = (True, c is contact[exp.duplicate_of])
            if exp.priority_after_merge:
                checks["priority_after_merge"] = (exp.priority_after_merge.value, c.priority)
            fails += [f"| {i} | {k} | {e} | {v} |" for k, (e, v) in checks.items() if e != v]
    return fails


def run_one(row: SeedRow, providers) -> dict:
    try:
        r = extract_enquiry(
            row.channel, row.received_at, row.sender_name, row.phone, row.message, providers=providers
        )
    except AIUnavailable as e:
        return {"id": row.id, "error": str(e), "extraction": None}
    return {
        "id": row.id,
        "model_used": r.model_used,
        "latency_ms": r.latency_ms,
        "first_try_valid": r.first_try_valid,
        "errors": r.errors,
        "extraction": r.data.model_dump(mode="json"),
    }


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--model", choices=["deepseek", "gemini"], help="use only this provider (no fallback)")
    ap.add_argument("--ids", help="comma-separated enquiry ids, e.g. 2,7,13,18")
    ap.add_argument("--no-save", action="store_true", help="do not write ai_results.json / report.md")
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    providers = configured_providers()
    if args.model:
        providers = [p for p in providers if p.name == args.model]
    if not providers:
        print(
            "No AI provider available. Set DEEPSEEK_API_KEY and/or GEMINI_API_KEY (see .env.example).",
            file=sys.stderr,
        )
        return 2

    gold = load_gold()
    rows = {r.id: r for r in read_enquiries()}
    ids = [int(x) for x in args.ids.split(",")] if args.ids else sorted(rows)
    routing = " -> ".join(f"{p.name}:{p.model}" for p in providers)
    print(f"Running extraction on {len(ids)} enquiries via {routing} ...")

    with ThreadPoolExecutor(max_workers=args.workers) as pool:
        results = {r["id"]: r for r in pool.map(lambda i: run_one(rows[i], providers), ids)}

    scores = {}
    for i in ids:
        r = results[i]
        got = ExtractedEnquiry.model_validate(r["extraction"]) if r["extraction"] else None
        scores[i] = score_item(gold[i], got, r.get("first_try_valid", False))

    table = summarise(scores)
    mism = mismatches(scores, rows)
    sys_fails = None
    if not args.ids and all(results[i]["extraction"] for i in ids):
        sys_fails = system_checks(gold, rows, results)
    failed = [r for r in results.values() if r["extraction"] is None]
    fell_back = [
        r for r in results.values() if r["extraction"] and r["model_used"].split(":")[0] != providers[0].name
    ]
    latencies = sorted(r["latency_ms"] for r in results.values() if r["extraction"])
    now = datetime.now(DHAKA).strftime("%Y-%m-%d %H:%M")

    md = [
        "# Extraction eval report",
        "",
        f"- Date: {now} (Asia/Dhaka)",
        f"- Routing: {routing}",
        f"- Enquiries: {len(ids)} ({'all' if not args.ids else 'ids ' + args.ids})",
        f"- Calls that fell back to another provider: {len(fell_back)}; failed completely: {len(failed)}",
        f"- Median latency: {latencies[len(latencies) // 2] if latencies else '-'} ms",
        "",
        "| Field | Score | Target | Met |",
        "|---|---|---|---|",
    ]
    for f, correct, n, target, met in table:
        pct = f"{correct}/{n}" + (f" ({correct / n:.0%})" if n else "")
        tgt = (
            "-"
            if target is None
            else (f"≥ {target:.0%}" if f == "flags recall" else f"≥ {target * n:.0f}/{n}")
        )
        md.append(f"| {f} | {pct} | {tgt} | {'-' if met is None else ('yes' if met else '**no**')} |")
    md += [
        "",
        "System rules (normalize.py: phone, missing phone, duplicate merge, merged priority): "
        + (
            "not checked (needs all 20 rows to succeed)"
            if sys_fails is None
            else ("all correct" if not sys_fails else f"**{len(sys_fails)} failures**")
        ),
    ]
    if sys_fails:
        md += ["", "| id | system field | expected | got |", "|---|---|---|---|", *sys_fails]
    md += ["", "## Mismatches", ""]
    if mism:
        md += ["| id | field | expected | got |", "|---|---|---|---|", *mism]
    else:
        md.append("None.")
    if failed:
        md += ["", "## Failed calls", ""] + [f"- #{r['id']}: {r['error']}" for r in failed]
    md += ["", "## Messages with mismatches", ""]
    for i in sorted({int(line.split("|")[1]) for line in mism}):
        md.append(f"- **#{i}** ({rows[i].channel}): {rows[i].message}")
    report = "\n".join(md) + "\n"
    print("\n" + report)

    if not args.no_save:
        existing = {}
        if RESULTS_PATH.exists():
            existing = {r["id"]: r for r in json.loads(RESULTS_PATH.read_text(encoding="utf-8"))["items"]}
        existing.update({i: r for i, r in results.items() if r["extraction"] is not None})
        RESULTS_PATH.write_text(
            json.dumps(
                {"generated_at": now, "routing": routing, "items": [existing[i] for i in sorted(existing)]},
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        REPORT_PATH.write_text(report, encoding="utf-8")
        print(
            f"Saved {RESULTS_PATH.relative_to(ROOT)} ({len(existing)} items) and {REPORT_PATH.relative_to(ROOT)}"
        )
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
