# NOTE (draft, finalised in M10)

## Decisions and findings so far

**M1, extraction eval (2026-11-04, `eval/report.md`):**
- DeepSeek (`deepseek-flash`) scores 20/20 on message type, language, status, interest, priority, name,
  follow-up date (3/3), flags (9/9 recall) and valid JSON on the first try, after two prompt fixes found by the eval:
  1. Flag meanings were only Python comments in `schema.py`, so the model never saw them; #5 ("will call again")
     missed `callback_requested`. Added one line per flag to the prompt.
  2. "Wants to cancel and get money back" (#16) came back `New`; the prompt now says a refund/cancel request means `Paid`.
  Both fixes are general rules; no sample enquiry was put into the prompt (a test checks this).
- **Bangla routing: not needed.** DeepSeek gets all 4 Bangla-script rows (#2, #7, #13, #18) right, including
  Bangla digits (১৫ → 15). Every call stays on DeepSeek.
- **Gemini fallback is unreliable on the free tier.** `gemini-2.5-flash` is not available to this key (404);
  `gemini-flash-latest` timed out or returned 503/429 on all 20; `gemini-3.5-flash` (now the default fallback)
  answered 7/20 in a full run, the rest 503/429. The fallback keeps a single live paste alive, but the demo
  must not depend on it: seeded AI results (`backend/seed/ai_results.json`) mean no live call is needed.
- Caveat: 20 rows is a small test set, and the prompt was tuned on it (by rules, not examples), so real-world
  accuracy will be lower than 100%.

**M2, deploy (2026-11-04):** live at https://biai-crm.fastapicloud.dev (FastAPI Cloud, deployed with `fastapi deploy`).
- **The filesystem does not survive a redeploy.** `/api/health` counts boots in `data/boot_count.txt`; after a
  redeploy the new instance started again at 1. So SQLite is rebuilt from `backend/seed/` on every boot
  (as planned), and anything staff change on the live demo is lost on the next deploy. Fine for a demo;
  a real rollout needs Postgres.
- Only `backend/`, `pyproject.toml` and `uv.lock` are uploaded (`.gitignore` + `.fastapicloudignore`), about 190 KB.

**M5, replies (2026-11-04, `eval/replies.md`):**
- Code decides the reply format (spam: none, Facebook comment: public, phone note: call script), the language
  and what to ask for (missing phone, transaction ID...); the AI writes the words from `seed/faq.yaml` only
  (fictional placeholder values, `placeholder: true`); anything not in the FAQ goes to "team will confirm".
- Code then checks every draft: numbers not in the FAQ or the customer's message, letters from other
  scripts, wrong script for the language, public comments over 2 sentences. On a problem the AI rewrites once;
  what is left shows "check before sending".
- Reading the first 55 drafts found what the automatic checks missed: DeepSeek sometimes slips a Cyrillic or
  Bangla word into a reply ("онлайн" inside a Bangla reply), and our own FAQ wording made "onsite" sound like our
  campus. Both fixed (script check + FAQ). Now 55/55 drafts pass all checks; #7 asks for the bKash transaction
  ID, #16 is a call script that quotes the refund policy without promising an outcome, #11 gets no reply,
  #17 says the certificate is not government approved.
- Limit: the number guard checks numbers one by one, so a wrong "3" passes because the FAQ contains a "3".
  Dates written in words ("March") are not checked.
- All 19 seeded contacts ship with drafts in all three languages (`seed/replies.json`), so the demo and the
  language switch need no live AI call.

**M7, follow-ups + weekly summary (2026-11-04):**
- Code computes every figure (this week's volume, pipeline by status, overdue / urgent counts, corporate
  pipeline and people to train, channel / language / interest breakdowns) and a ranked "chase first"
  shortlist (most urgent, then overdue, then longest wait). The AI only writes the overview, picks up to 5
  people from that shortlist with a one-line next action, and adds one observation.
- Code checks the AI's text: every number must appear in the computed figures (one rewrite if not),
  chase-first contacts must come from the shortlist. Seeded summary: all checks pass, Habibur and Rafi first.
- First draft wrote "several contacts are overdue" because the overdue count was not in the figures: the
  rule worked; we added the count. The live run also exposed a counting bug when the demo clock is moved
  back (new contacts were not capped at "now"); fixed with a test.
- A pre-generated summary for the seeded data ships in `seed/summary.json` (reused while the figures are
  unchanged), so the demo needs no live AI call. Any change to the data hides it until "Generate" is clicked.
