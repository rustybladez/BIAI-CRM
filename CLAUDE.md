# BIAI CRM (Round 2 task)

A small CRM for BIAI enquiries from WhatsApp, Facebook, the website and phone call notes.
The AI reads a pasted message, fills the fields, and suggests a reply in the sender's language.
Deadline-driven project: prefer simple, working, demo-able code over abstractions.

## Workflow
- `PRD.md` is the plan: scope, rubric mapping, milestones, acceptance criteria. PRD §0 restates BIAI's original brief
  (`BRIEF.md` is kept local and is not in the repo).
- Work on one PRD milestone at a time, in order. Before starting, read that milestone and its "Done when".
- When a milestone is done: run its checks, tick its boxes in PRD.md, commit, and stop for review.
- If something in the PRD conflicts with the brief (PRD §0), the brief wins; flag it instead of guessing.

## Stack
- Monorepo. Backend: FastAPI + SQLModel + SQLite. Frontend: Vite + React + Tailwind (no Next.js, no SSR).
- FastAPI serves the built frontend with `app.frontend("/", directory="static")`. API routes live under `/api`.
- Deploy target: FastAPI Cloud. Assume the filesystem may be wiped on restart (see "Seeding").
- Python 3.12+: use `X | None`, built-in generics (`list[str]`, `dict[str, int]`), never `typing.Optional`/`List`/`Dict`.

## Layout
```
backend/
  main.py            app, routers, app.frontend()
  api/               enquiries, pipeline, ai, reminders, summary
  ai/client.py       single LLM call function: DeepSeek first, Gemini fallback
  ai/prompts.py      extraction (done), reply, weekly summary
  ai/schema.py       Pydantic models = the JSON the AI must return (done)
  db.py              SQLModel tables + session
  normalize.py       phone normalisation, duplicate merge, priority rules
  seed/              enquiries.csv, ai_results.json, faq.yaml
  static/            built frontend (output of `npm run build`)
frontend/
eval/gold.json       hand-labelled expected output for the 20 sample enquiries (done)
eval/run_eval.py     scores the AI against gold.json, prints a table
```

## AI rules
- Both providers are called through the OpenAI-compatible client. Model names and base URLs come from env vars
  (`DEEPSEEK_API_KEY`, `DEEPSEEK_MODEL`, `GEMINI_API_KEY`, `GEMINI_MODEL`). Never hardcode keys.
- DeepSeek is primary for everything. Fall back to Gemini only on error, rate limit (429), or JSON that fails
  Pydantic validation after one retry.
- Always request JSON output and validate with the Pydantic model in `ai/schema.py`.
- The AI only judges ONE message. Anything needing other records or arithmetic is plain code in `normalize.py`:
  phone normalisation (Bangla digits ০-৯ → 0-9, +880/880 → 0, 10-digit `1…` → `01…`), duplicate merge by phone,
  missing-phone flag, 48h overdue check, dropping a `follow_up_by` more than 7 days out without `callback_requested`,
  and raising a merged record to `urgent` when the same person writes again with no reply in between.
- Intake needs only the message. Channel, sender name and time come from the form first, then the paste
  (`channel_in_message`, `received_at_in_message`), then (time only) the demo clock. Never invent them.
- `suggested_status` is a suggestion only: shown when a message merges into a Contacted / Interested contact,
  applied only by a staff click.
- Replies may only state facts found in `seed/faq.yaml` (fictional placeholder values, labelled as such in the UI).
  If the answer is not there, the reply says the team will confirm. Never invent prices, dates, policies or approvals.
- Reply language matches the sender: Bangla script → Bangla script, Banglish → Banglish, English → English.
  Staff can switch the language with one click. Facebook comments get a short public reply that invites them to inbox.
  Phone call notes get a call script, not a text message. Spam and irrelevant messages get no sales reply.
- Never put the 20 sample enquiries into a prompt as examples (it invalidates the eval).

## Data
- Use only the provided sample data. No real customer data.
- `received_at` is Asia/Dhaka local time. Bangladesh workweek is Sunday–Thursday.
- Pipeline statuses in order: New, Contacted, Interested, Paid, Lost. Spam and irrelevant are kept out of the
  pipeline in a separate "Not a lead" tray.
- A configurable "demo clock" (`DEMO_NOW` env var or a UI setting) drives all overdue / 48h logic.

## Seeding
- On startup, if the DB is empty, load `seed/enquiries.csv` + `seed/ai_results.json` (pre-generated AI output).
  The demo must work without any live AI call. Only "paste a new message" calls the AI live.

## Commands
- Backend: `uv run fastapi dev` (entrypoint `backend.main:app` is set in pyproject.toml)
- Frontend: `cd frontend && npm run dev` (proxy `/api` to the backend); build with `npm run build` into `backend/static`
- Keys: `.env` in the repo root or `backend/.env` (both are loaded). On Windows set `PYTHONIOENCODING=utf-8` for the
  eval scripts, or printing the report fails.
- Eval: `uv run python eval/run_eval.py` (rewrites seed AI results); `--report-only` writes `eval/report.md` and keeps
  `backend/seed/ai_results.json` (use this one: the seeded replies and weekly summary depend on those results)
- Replies: `uv run python eval/run_reply_checks.py` (checks saved drafts); add `--generate` to rewrite
  `backend/seed/replies.json` with the AI (run it after changing faq.yaml or the reply prompt)
- Weekly summary: `uv run python eval/run_summary_check.py` (checks the saved one); `--generate` rewrites
  `backend/seed/summary.json` (run it after changing the seed data, the stats or the summary prompt)
- Deploy: `npm run build` (in frontend/), then `uv run fastapi deploy` → https://biai-crm.fastapicloud.dev
  (first time on a new machine: `uv run fastapi login`, then `uv run fastapi cloud link`). The filesystem is wiped on
  every redeploy, so the DB must reseed on boot.
- Checks: `uv run ruff check backend tests eval && uv run pytest -q`; frontend `npm run lint && npm run build`
- Browser demo check (PRD §12): `BASE=http://localhost:8000 node tests/e2e/demo.js` (live AI for the paste step)
- `backend/static/` (the built frontend) is committed so a fresh clone and FastAPI Cloud can serve it without Node.

## Skills
- `.claude/skills/fastapi` and `.claude/skills/sqlmodel` are the official skills shipped inside those packages.
  Follow them (Annotated params, return types, `app.frontend()`, `session.exec(select(...))`, aware datetimes).