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
