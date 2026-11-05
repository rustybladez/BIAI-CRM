# Build log

Decisions, findings and verification results, milestone by milestone, written while building. The short
submission note is [`NOTE.md`](../NOTE.md); the plan is [`PRD.md`](../PRD.md).

## Decisions and findings

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

**M8, polish (2026-11-04):**
- Tested with the AI switched off (invalid keys): every AI action shows a plain error and a retry; saved
  drafts, Mark as sent, drag-and-drop and the summary figures keep working; a pasted message can be
  filled in by hand so no enquiry is lost. The test also showed the raw provider error (with the last
  characters of the API key) reaching the screen: now users see a plain message and details go to the log.
- Usability: the customer's latest message sits right above the suggested reply, a one-line "copy, send,
  then Mark as sent" hint, important flags labelled on cards, "Program not stated" instead of "Not stated".
- Bangla checked on every screen at 1366x768 (Hind Siliguri + Inter load; no fallback boxes).

**Card order (2026-11-04):** columns can be sorted two ways, switched above the board (remembered per browser):
"Priority first" (default: an urgent card beats a low / medium overdue one; overdue first within a priority)
or "Overdue first" (all overdue cards on top, then priority). In both, ties go to whoever has waited longest.
The Follow-ups list and the API default use priority first too, matching the weekly summary's chase-first list.
Cards cannot be reordered by hand on purpose: the order is automatic, so nobody has to keep it tidy.

**UI redesign (2026-11-04):** the first UI opened on a Kanban board that was 3,047 px tall on a laptop, with no
overview and the "Not a lead" tray at the bottom. Redesigned around a left sidebar and three screens:
- **Today** (home): status line, five KPI cards that open filtered views, "Needs you now" queue (All waiting /
  Urgent / Overdue / Due today) with Reply or Call, the AI weekly brief, pipeline bar, channels.
- **Pipeline**: one toolbar (Pipeline / Not a lead tabs, filter menu with removable chips, sort, Board / Table),
  compact three-line cards, columns that scroll inside a page that no longer scrolls; empty columns shrink.
- **Contact panel**: chat-style thread (Messenger-like bubbles, day separators, merge / status / note lines), the
  reply composer docked under it, properties on the right with click-to-edit, ‹ › to step through the queue.
- **New enquiry** in two panes, **Reports** page, search (name, phone, company, message text, Bangla included),
  demo clock and reset moved into a "Demo mode" box. Shortcuts: `/` search, `n` new enquiry, `j`/`k` next/previous.

**M9, final verification (2026-11-04, live URL):**
- Production serves byte-identical files to the local build; reset works there (19 contacts, 17 in the
  pipeline, 6 overdue, clock back to 28 Oct 12:00); Today screen ready in 0.8-1.3 s.
- Browser demo script (14 steps, live AI for paste, reply language switch and weekly summary) passed twice in a
  row on the public URL with no console errors.
- Fresh extraction eval (report-only run, seed data unchanged): every target met, 20/20 on all scored fields;
  exact priority 19/20 (#6 rated medium vs gold low, within the accepted one-level tolerance and listed in the
  report). Runs vary slightly: the previous run had 18/20 exact priority.
- 108 backend tests, reply checks (55 drafts) and summary checks all pass; no API keys in the repo.

**Overdue fix (2026-11-05, found in review):** two bugs in the 48-hour rule.
1. Waiting time and overdue were measured from the *latest* message, so a second message restarted the clock:
   Rafi showed "26 h" and was not overdue although he had waited 51 h since Monday 09:12. Now both are measured
   from `waiting_since`, the first message after our last reply.
2. The 48-hour rule only applied to status New, so Farzana (Paid, payment unconfirmed, four days without a
   reply) was never overdue. The brief says "anyone not followed up in 48 hours": the rule now applies to every
   pipeline status except Lost, whenever we owe a reply.
At the default demo time 7 people are overdue (Rafi added). Rafi now ties with Habibur (both urgent and
overdue) and goes first on the longest wait. Seeded weekly summary regenerated (all checks pass); tests added for
both cases, for a Contacted contact who writes again, and for Lost / already-replied contacts.

**Event order for "awaiting reply" (2026-11-05, found in review):** with the frozen demo clock, a reply marked
sent and a new message saved in the same minute had equal timestamps, so `last_outbound_at < last_inbound_at`
was false and the new message counted as answered. "Who owes a reply" is now decided by event order: an inbound
message is unanswered when its Activity id is greater than the latest `reply_sent` Activity id. Used by
`awaiting_reply`, `waiting_since`, `no_reply_since_last_message` and so `would_escalate`. Tests (rules and API):
Rafi marked sent at 28 Oct 12:00, then a new message from 01711000001 at 12:00 is awaiting a reply with
`waiting_since` = 12:00; both tests fail on the previous code.

**Stale escalation after a reply (2026-11-05, found in review):** after Mark as sent, Rafi kept "urgent · Asked
again, no reply yet" and the "Asked again" banner although we had just replied. `mark_sent` now drops the
`repeat_no_reply` flag and restores the highest AI priority across the contact's messages with that message's
reason (Rafi: high, from #1); `duplicate_merged` stays. If they write twice before our next reply, rule 4
escalates again. Tests cover the round trip; the browser test checks the banner disappears and HIGH is shown.
