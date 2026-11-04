"""
Reply checks (PRD §10.2) over every seeded contact, plus eval/replies.md for a manual read.

    uv run python eval/run_reply_checks.py --generate   # call the AI: drafts in all 3 languages -> seed/replies.json
    uv run python eval/run_reply_checks.py              # check the saved drafts (no AI calls)

Checks: language/script match, format by channel and type, number guard (0 unverified numbers),
missing phone -> asks for a number, plus the M5 acceptance cases (#7, #11, #16, #17).
"""

import argparse
import json
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from sqlmodel import Session, SQLModel, select  # noqa: E402

from backend.ai.replies import ask_for, foreign_letters, reply_format, unverified_numbers  # noqa: E402
from backend.api.replies import new_draft  # noqa: E402
from backend.config import DHAKA  # noqa: E402
from backend.db import Contact, Enquiry, make_engine  # noqa: E402
from backend.seed.seed import REPLIES_PATH, seed  # noqa: E402

REPORT_PATH = ROOT / "eval" / "replies.md"
LANGUAGES = ["bangla", "banglish", "english"]
BANGLA = re.compile(r"[ঀ-৿]")
SENTENCE_END = re.compile(r"[.!?।]+(?:\s|$)")
# Rough Banglish markers (report only: Banglish vs English is a heuristic).
BANGLISH_WORDS = {
    "ji",
    "apnar",
    "apnake",
    "apni",
    "dhonnobad",
    "korte",
    "parben",
    "hobe",
    "kore",
    "amra",
    "amader",
    "jante",
    "dibo",
    "jonno",
    "ache",
    "kono",
    "ekta",
    "shathe",
    "ar",
    "kintu",
    "na",
    "hoy",
    "korben",
    "pathiye",
}
PHONE_WORDS = re.compile(r"phone|number|nombor|nambar|whatsapp|নম্বর|নাম্বার|ফোন", re.I)
TRANSACTION_WORDS = re.compile(r"transaction|trx|ট্রানজেকশন|ট্রানজ্যাকশন|লেনদেন", re.I)
NEGATION = re.compile(r"\bnot\b|\bnoy\b|\bnoi\b|\bna\b|নয়|নয়|না\b", re.I)


def seeded_session() -> Session:
    engine = make_engine("sqlite://")
    SQLModel.metadata.create_all(engine)
    session = Session(engine)
    seed(session, with_replies=False)
    return session


def contacts_by_key(session: Session) -> dict[int, Contact]:
    """Key each contact by its first sample enquiry id (Rafi = 1)."""
    out: dict[int, Contact] = {}
    seen: set[int] = set()
    for e in sorted(session.exec(select(Enquiry)).all(), key=lambda e: e.seed_id):
        if e.contact_id not in seen:
            seen.add(e.contact_id)
            out[e.seed_id] = e.contact
    return out


def generate(session: Session, workers: int) -> None:
    contacts = contacts_by_key(session)
    jobs = [
        (k, lang)
        for k, c in contacts.items()
        for lang in LANGUAGES
        if c.message_type != "spam" or lang == c.language
    ]
    print(f"Generating {len(jobs)} drafts ({len(contacts)} contacts x languages) ...")

    def run(job):
        k, lang = job
        d = new_draft(contacts[k], lang)
        return {
            "seed_id": k,
            **{
                f: getattr(d, f)
                for f in ("language", "format", "body", "faq_keys_used", "needs_confirmation")
            },
            "model_used": d.model_used,
            "latency_ms": d.latency_ms,
        }

    # Contacts are read-only here; load relationships before threading.
    for c in contacts.values():
        _ = c.enquiries
    with ThreadPoolExecutor(max_workers=workers) as pool:
        items = list(pool.map(run, jobs))
    REPLIES_PATH.write_text(
        json.dumps(
            {"generated_at": datetime.now(DHAKA).strftime("%Y-%m-%d %H:%M"), "items": items},
            ensure_ascii=False,
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    print(f"Saved {REPLIES_PATH.relative_to(ROOT)}")


def check(session: Session) -> tuple[list[tuple[str, int, int]], list[str], list[str]]:
    """Returns (summary rows (check, passed, total), failures, banglish notes)."""
    contacts = contacts_by_key(session)
    items = json.loads(REPLIES_PATH.read_text(encoding="utf-8"))["items"]
    results: dict[str, list[bool]] = {}
    fails: list[str] = []
    notes: list[str] = []

    def record(name: str, ok: bool, item: dict, why: str = "") -> None:
        results.setdefault(name, []).append(ok)
        if not ok:
            fails.append(f"| #{item['seed_id']} | {item['language']} | {name} | {why} |")

    for item in items:
        c = contacts[item["seed_id"]]
        enquiries = sorted(c.enquiries, key=lambda e: (e.received_at, e.id))
        channel = enquiries[-1].channel
        body = item["body"]
        expected_fmt = reply_format(c.message_type, channel).value

        record(
            "format by channel/type",
            item["format"] == expected_fmt,
            item,
            f"{item['format']} != {expected_fmt}",
        )
        if expected_fmt == "none":
            record("spam has no reply", body == "", item, "body not empty")
            continue
        foreign = foreign_letters(body)
        record("no letters from other scripts", not foreign, item, f"found {' '.join(foreign)}")
        has_bangla = bool(BANGLA.search(body))
        record(
            "script matches language",
            has_bangla == (item["language"] == "bangla"),
            item,
            "Bangla script missing" if item["language"] == "bangla" else "unexpected Bangla script",
        )
        if item["language"] in ("banglish", "english"):
            words = set(re.findall(r"[a-z]+", body.lower()))
            hits = len(words & BANGLISH_WORDS)
            looks = "banglish" if hits >= 3 else "english"
            if looks != item["language"]:
                notes.append(
                    f"- #{item['seed_id']} {item['language']}: looks {looks} ({hits} Banglish markers)"
                )
        if expected_fmt == "public_comment":
            n = len(SENTENCE_END.findall(body.strip())) or 1
            record("public comment ≤ 2 sentences", n <= 2, item, f"{n} sentences")
        unverified = unverified_numbers(body, [e.message for e in enquiries])
        record("number guard: 0 unverified numbers", not unverified, item, f"unverified {unverified}")
        if c.missing_phone and ask_for(c.missing_info, True, reply_format(c.message_type, channel), c.flags):
            record(
                "missing phone -> asks for a number", bool(PHONE_WORDS.search(body)), item, "no phone request"
            )

        # M5 acceptance cases
        if item["seed_id"] == 7:
            record(
                "#7 asks for the transaction ID",
                bool(TRANSACTION_WORDS.search(body)),
                item,
                "no transaction ID",
            )
        if item["seed_id"] == 16:
            record("#16 is a call script", item["format"] == "call_script", item, item["format"])
        if item["seed_id"] == 17:
            ok = "certificate" in item["faq_keys_used"] and bool(NEGATION.search(body))
            record("#17 does not claim government approval", ok, item, "no 'not approved' / FAQ key missing")

    spam = [i for i in items if i["seed_id"] == 11]
    results.setdefault("#11 (spam) has no reply", []).append(
        bool(spam) and all(i["body"] == "" for i in spam)
    )
    rows = [(name, sum(v), len(v)) for name, v in results.items()]
    return rows, fails, notes


def write_report(session: Session, rows, fails, notes) -> str:
    contacts = contacts_by_key(session)
    items = json.loads(REPLIES_PATH.read_text(encoding="utf-8"))["items"]
    md = ["# Reply checks", "", "| Check | Passed |", "|---|---|"]
    md += [f"| {name} | {p}/{n}{'' if p == n else ' **FAIL**'} |" for name, p, n in rows]
    if fails:
        md += ["", "## Failures", "", "| id | language | check | detail |", "|---|---|---|---|", *fails]
    if notes:
        md += ["", "## Banglish vs English heuristic (report only)", "", *notes]
    md += ["", "## All drafts", ""]
    for k, c in sorted(contacts.items()):
        enquiries = sorted(c.enquiries, key=lambda e: (e.received_at, e.id))
        md += [
            f"### #{k} {c.name or '(no name)'} · {enquiries[-1].channel} · {c.message_type} · wrote in {c.language}",
            "",
        ]
        md += [f"> {e.message}" for e in enquiries]
        for item in sorted(
            (i for i in items if i["seed_id"] == k), key=lambda i: LANGUAGES.index(i["language"])
        ):
            meta = f"FAQ: {', '.join(item['faq_keys_used']) or '-'}"
            if item["needs_confirmation"]:
                meta += f" · team to confirm: {'; '.join(item['needs_confirmation'])}"
            md += [
                "",
                f"**{item['language']}** ({item['format']}) · {meta}",
                "",
                item["body"] or "_(no reply)_",
            ]
        md.append("")
    return "\n".join(md) + "\n"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument(
        "--generate", action="store_true", help="call the AI and rewrite backend/seed/replies.json"
    )
    ap.add_argument("--workers", type=int, default=4)
    args = ap.parse_args()

    session = seeded_session()
    if args.generate:
        generate(session, args.workers)
    if not REPLIES_PATH.exists():
        print("No backend/seed/replies.json yet; run with --generate", file=sys.stderr)
        return 2
    rows, fails, notes = check(session)
    report = write_report(session, rows, fails, notes)
    REPORT_PATH.write_text(report, encoding="utf-8")
    print("\n".join(report.split("## All drafts")[0].splitlines()))
    print(f"Full drafts in {REPORT_PATH.relative_to(ROOT)}")
    return 1 if fails or any(p != n for _, p, n in rows) else 0


if __name__ == "__main__":
    raise SystemExit(main())
