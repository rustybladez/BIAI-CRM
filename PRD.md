# PRD: BIAI CRM (Round 2, Task 1)

| | |
|---|---|
| Owner | Candidate (AI Intern, Round 2) |
| Builder | Claude Code, working milestone by milestone |
| Source of truth for the task | §0 below (BIAI's brief for Task 1, restated) and `backend/seed/TASK README.md` (sample data notes) |
| Standing rules | `CLAUDE.md` |
| Deadline | Thursday 5 Nov 2026, 9:00 PM Dhaka time. Feature freeze Thursday 12:00. |

---

## 0. The brief (BIAI Round 2, Task 1), restated

This section holds everything from BIAI's brief that applies to this project. If anything later in the PRD conflicts with this section, this section wins.

**Rules**
- 72 hours from receiving the brief. One 24-hour extension may be requested once, before the deadline (exams only).
- Any AI tools may be used; BIAI wants to see *how* AI is used to build.
- **Use only the provided sample data. No real customer data.**

**The problem.** People contact BIAI through WhatsApp, Facebook, the website and phone calls. Some enquiries get lost, and nobody can see who needs a follow-up.

**Build a simple CRM that:**
1. Saves each enquiry: name, phone, where they came from, what they want (bootcamp, fellowship or corporate training) and their status.
2. Uses AI to read a pasted message and fill in those details automatically.
3. Suggests a reply in English or Banglish, matching how the person wrote.
4. Shows a simple pipeline: New, Contacted, Interested, Paid, Lost.

**Extra (optional):** a reminder for anyone not followed up in 48 hours, and a weekly summary written by AI.

**Provided:** 20 sample enquiries in Bangla, Banglish and English (`backend/seed/enquiries.csv`). All people and numbers are fictional. Some are not sales enquiries (support issues, spam, a job seeker); the CRM should handle each kind sensibly.

**What to submit**
1. A Loom video, 5 minutes or less, presenting the idea: explain the problem, show it working on the sample data, explain the choices. This is scored, not an extra; BIAI is hiring people who can explain and sell what they build.
2. A working link to the demo.
3. The work: the code (this repo).
4. A short note (half a page): what was built, which AI tools were used and how, what does not work yet, what would be fixed next.

If shortlisted: a 20-minute call to show the work, including one small change made live.

**Scoring (BIAI's weights)**

| What they check | Weight |
|---|---|
| Loom presentation: clear, confident, easy to follow, makes them want to use it | 20% |
| Works from start to finish on the sample data | 25% |
| Smart use of AI (not just a chatbot added on top) | 20% |
| Would BIAI's team actually use it? | 15% |
| Clear explanation of choices and what does not work | 10% |
| Polish and handling of Bangla and Banglish | 10% |

---

## 1. Goal

Build a small, reliable CRM that BIAI's team would actually use to stop losing enquiries, and that scores as high as possible on BIAI's rubric.

Every decision in this PRD is judged by one question: **does it raise a rubric score, and can we show it in a 5-minute Loom video?** If a feature cannot be shown or explained in the video, it is low priority.

The product in one sentence: *paste any enquiry, in Bangla, Banglish or English, from any channel; the CRM sorts it, fills the record, spots duplicates and urgency, suggests a safe reply in the sender's language, and shows who needs a follow-up now.*

---

## 2. How we are scored, and how the product answers each line

This table drives scope and priority. Weights are BIAI's.

| Rubric line (weight) | What earns the score | Product features that deliver it | Proof in the Loom video |
|---|---|---|---|
| **Loom presentation (20%)** | Clear, confident, easy to follow, makes them want to use it | A fixed demo script (§12) built around 4 memorable moments: live Bangla paste, Rafi merge → urgent, angry refund call, eval table | The whole video |
| **Works end to end on sample data (25%)** | All 20 enquiries load, display and behave correctly; no crashes; deployed link works | Reseed-on-boot from CSV + pre-generated AI results; demo clock; deployed on FastAPI Cloud; automated tests for code rules; zero live AI calls needed to see the seeded data | Show all 20 on the board; click through without errors |
| **Smart use of AI, not a chatbot on top (20%)** | AI does real work inside the workflow | (1) structured extraction into typed fields, (2) message-type triage (lead/support/complaint/spam/irrelevant), (3) priority with reasons, (4) relative-time follow-up extraction, (5) language-matched replies grounded in an FAQ (no invented facts), (6) self-reported low-confidence fields for human review, (7) AI summary over numbers computed by code, (8) a measured accuracy score | Eval table on screen; "AI where judgement is needed, code where it isn't" |
| **Would BIAI's team actually use it (15%)** | Solves "enquiries get lost" and "nobody sees who needs follow-up" | Pipeline board, overdue/48h highlights, "Not a lead" tray, duplicate merge, one-click copy reply + "mark as sent", follow-ups screen, weekly summary | Morning routine walkthrough: open app → see what to do first |
| **Explain choices and what doesn't work (10%)** | Honest, specific trade-offs | Eval mismatches shown openly; `NOTE.md` limitations; documented decisions (§14) | 30 seconds on choices + limitations |
| **Polish and Bangla/Banglish handling (10%)** | Bangla renders well; Banglish understood; replies match the sender | Bangla-capable font, Bangla digit normalisation, language detection, replies in Bangla script / Banglish / English with a one-click switch, Bangla-specific eval rows | Live paste of a Bangla message; switch reply language |

**Priority rule for scope:** the 25% (works end to end) and the 20% (Loom) come first. Never trade reliability for an extra feature.

---

## 3. Users and core jobs

**Primary user:** a BIAI admissions / sales staff member who handles incoming messages from all channels.

Jobs to be done:
1. *"When a message comes in, I want it recorded with the right details without typing them."*
2. *"I want to see at a glance who is waiting for a reply and who is most urgent."*
3. *"I want a good reply I can send immediately, in the language the person used, without risking a wrong fact."*
4. *"I don't want spam, job seekers or support issues mixed into my sales pipeline."*
5. *"Once a week, I want to know what happened and who to chase first."*

Secondary user: a BIAI manager reading the weekly summary.

---

## 4. Scope

### 4.1 Required by the brief (must ship)

| ID | Requirement (brief wording in quotes) | Notes |
|---|---|---|
| R1 | "Saves each enquiry: name, phone, where they came from, what they want (bootcamp, fellowship or corporate training) and their status." | Stored in SQLite. Interest also allows `other`, `unclear`, `not_applicable` (see §6). |
| R2 | "Uses AI to read a pasted message and fill in those details automatically." | Intake screen. Output validated against `ExtractedEnquiry`. |
| R3 | "Suggests a reply in English or Banglish, matching how the person wrote." | Extended: Bangla script senders get Bangla script replies (documented decision, §14). One-click language switch. |
| R4 | "Shows a simple pipeline: New, Contacted, Interested, Paid, Lost." | Kanban board with drag-and-drop. |

### 4.2 Optional extras from the brief (ship both: cheap, high rubric value)

| ID | Extra | Notes |
|---|---|---|
| X1 | "A reminder for anyone not followed up in 48 hours" | Overdue badges on board + Follow-ups screen. Driven by the demo clock. |
| X2 | "A weekly summary written by AI" | Code computes numbers; AI writes the narrative and the "chase first" list. |

### 4.3 Differentiators (ship, in this order, if time allows)

| ID | Feature | Why it scores |
|---|---|---|
| D1 | Message-type triage + "Not a lead" tray | The data README explicitly asks how we handle support, spam and job seekers. |
| D2 | Duplicate merge by normalised phone, with timeline | Directly shows "enquiries get lost" being fixed (Rafi #1 + #12). |
| D3 | Priority + reason, including code-side escalation to `urgent` | Staff see what to do first and why. |
| D4 | FAQ-grounded replies (no invented facts) | Avoids the most damaging AI failure; strong "smart AI" talking point. |
| D5 | Low-confidence field highlights | Human-in-the-loop design; shows judgement. |
| D6 | Eval script + accuracy table | Measurable proof. Almost no candidate will have this. |
| D7 | Channel-aware replies (public comment, call script) | Shows understanding of real workflows. |
| D8 | CSV export of the pipeline | Small, practical. Only if everything else is done. |

### 4.4 Non-goals

- Authentication, multi-user roles, permissions.
- Real WhatsApp / Facebook / phone integrations. Intake is paste-in (and the seeded CSV).
- Sending messages. We copy the reply and log "sent"; staff send it in their own app.
- Real BIAI prices or policies. `faq.yaml` holds clearly labelled fictional placeholders.
- Mobile-first design. Desktop first; must not break on a laptop screen.

---

## 5. Sample data facts the product must handle

From `backend/seed/enquiries.csv` (20 rows, received 26–27 Oct 2026, Asia/Dhaka). Expected values are in `eval/gold.json`.

| Case | Rows | Required behaviour |
|---|---|---|
| Duplicate person | #1, #12 (Rafi Ahmed, same phone) | Merge into one contact; timeline shows both; merged priority `urgent` ("asked twice, no reply"). |
| Spam | #11 | Type `spam`, out of pipeline, no reply. |
| Job seeker | #20 | Type `irrelevant`, out of pipeline, polite redirect reply. |
| Payment not confirmed | #7 (Bangla, bKash on the 25th) | Type `support`, status `Paid` + `payment_unverified`, high priority, reply asks for transaction ID. |
| Angry refund + public threat | #16 (phone note) | Type `complaint`, status `Paid`, `urgent`, follow-up same day; reply is a call script. |
| Minor | #13 (class 9 student) | Flag `minor`; friendly, non-salesy reply; no personal data requests. |
| Missing phone | #2, #6, #9, #11, #13, #17 | Phone null; `missing_phone`; reply asks for a number where appropriate. |
| Role/company in sender name | #3, #10, #18 | Split into name / role / company; capture team size (40, 120, ১৫ → 15). |
| Relative times | #3 "this week", #5 "tomorrow after 5 PM", #16 "today" | Resolve against `received_at`; Bangladesh workweek Sun–Thu. |
| Bangla script | #2, #7, #13, #18 | Bangla replies; Bangla digits normalised. |
| Banglish | #1, #4, #6, #9, #12, #15, #17 | Banglish replies. |
| Public comment | #6, #11, #17 (Facebook comment) | Short public reply inviting them to inbox. |
| Facts we don't have | #1, #8, #9, #15, #17, #19 … | Reply quotes `faq.yaml` only; otherwise "we'll confirm". |

---

## 6. Data model

Enums live in `backend/ai/schema.py` and are the single source of truth. The frontend reads them from `GET /api/meta`, so adding a status or field is a one-place change (important for the live-change request on the call).

### Tables (SQLModel)

**Contact** (one per person)
- `id`, `name`, `role`, `company`, `team_size`
- `phone` (normalised, unique when not null), `missing_phone: bool`
- `interest`, `language`, `status` (null for spam/irrelevant), `message_type`
- `priority`, `priority_reason`, `flags: list[str]` (AI flags + system flags)
- `follow_up_by: datetime | None`, `last_inbound_at`, `last_outbound_at`
- `low_confidence_fields: list[str]`, `summary`, `missing_info: list[str]`
- `created_at`, `updated_at`

**Enquiry** (one per incoming message)
- `id`, `contact_id`, `channel`, `received_at`, `sender_name_raw`, `phone_raw`, `message`
- `extraction_json` (the raw validated `ExtractedEnquiry`), `model_used`, `latency_ms`

**Activity** (timeline)
- `id`, `contact_id`, `kind` (`inbound` | `reply_sent` | `status_change` | `note` | `merge`), `body`, `at`

**ReplyDraft**
- `id`, `contact_id`, `enquiry_id`, `language`, `format` (`text` | `public_comment` | `call_script` | `none`), `body`, `faq_keys_used: list[str]`, `needs_confirmation: list[str]`, `created_at`

### System (code-side) rules, in `backend/normalize.py`

1. **Phone normalisation:** Bangla digits `০-৯ → 0-9`; strip spaces/dashes; `+880` / `880` → `0`; valid BD mobile = `01[3-9]\d{8}`. Use `phone` from the CSV, else `phone_in_message` from the AI.
2. **Missing phone:** true if no valid phone from either source.
3. **Duplicate merge:** same normalised phone → same Contact. Contacts without a phone are never auto-merged (documented limitation).
4. **Priority escalation:** if a contact sends a new inbound message and `last_outbound_at` is null or earlier than the previous inbound, set priority to `urgent`, add system flag `repeat_no_reply`, reason "Asked again, no reply yet".
5. **Overdue (48h rule):** a pipeline contact is overdue if `follow_up_by` has passed, or if status is `New` and `now − last_inbound_at > 48h` with no outbound since. `now` = demo clock.
6. **Mark as sent:** logs `reply_sent`, sets `last_outbound_at`, and moves `New → Contacted`. Clears overdue.
7. **Status changes are staff actions.** The AI only sets `New` or `Paid` on intake.

### Demo clock

`DEMO_NOW` env var (default `2026-10-28T12:00` Asia/Dhaka) plus a small UI control in the header. All overdue logic uses it. Shown visibly as "Demo time: …" so reviewers aren't confused.

---

## 7. AI design

### 7.1 Model routing

- One function in `backend/ai/client.py`; both providers via the OpenAI-compatible client; models and keys from env.
- **DeepSeek first** for every call. **Gemini fallback** on error, 429, timeout, or JSON that fails Pydantic validation after one retry.
- Record `model_used` and `latency_ms` per call (shown in the enquiry detail as small text; good for the video).
- If eval shows DeepSeek is clearly weaker on Bangla script rows, route **only Bangla-script messages** (detected in code) to Gemini. Decide from the M1 numbers, and record the decision in `NOTE.md`.

### 7.2 Extraction (done: `backend/ai/prompts.py`, `backend/ai/schema.py`)

Input: channel, received_at, sender_name, phone, message, plus a code-side script hint. Output: `ExtractedEnquiry` JSON. The prompt uses invented examples only. **Never add sample enquiries to any prompt.** Improve the prompt from eval mismatches, not by changing `gold.json` (unless a label is genuinely wrong, and then say so in the commit).

### 7.3 Reply suggestion (to build, M5)

Output model `SuggestedReply`:
- `language` (`bangla` | `banglish` | `english`), `format` (`text` | `public_comment` | `call_script` | `none`)
- `body`
- `faq_keys_used: list[str]` (which FAQ entries it relied on)
- `needs_confirmation: list[str]` (questions it could not answer from the FAQ)

Rules:
- Input: the contact record, the latest message(s), the relevant `faq.yaml` entries, the target language (default = detected; overridable by the UI switch).
- Only state facts present in the FAQ. Otherwise: "I'll confirm this with the team and get back to you" (in the target language).
- Format by channel and type: Facebook comment → `public_comment` (≤ 2 sentences, invite to inbox, no prices in public); phone note → `call_script` (opening line + points to cover); spam → `none`; irrelevant → short polite redirect; complaint → empathetic, owns the issue, gives a concrete next step, no arguing; minor → friendly, no hard sell, no personal data requests.
- Missing phone and not a public comment → ask for a contact number.
- Tone: warm, short, local. Bangla: polite form (আপনি). Banglish: natural, as BD staff write on WhatsApp (e.g. "Ji", "apnake").
- **Code-side guard:** after generation, scan the body for numbers/prices/dates. Any number not present in `faq.yaml` or the customer's own message → mark the draft "check before sending" in the UI.

### 7.4 FAQ (`backend/seed/faq.yaml`, to build, M5)

Keys (all values fictional placeholders, labelled `placeholder: true`): bootcamp price/duration/format, fellowship price/duration/start date/instalments/eligibility, corporate training (custom quote, onsite/online), class format (live/recorded, recordings), venue, certificate (state plainly whether it is government approved; placeholder "not government approved, BIAI certificate"), refund policy, student discount, payment methods (bKash, Nagad, bank), free masterclass, careers contact. The UI shows a small "Demo FAQ, placeholder values" note.

### 7.5 Weekly summary (to build, M7)

- Code computes all numbers first: totals by status, channel, interest, language; new this week; overdue list; urgent list; corporate pipeline (team sizes); not-a-lead counts.
- AI receives that JSON and writes: 3–5 sentence overview, "Chase first" (top 5 contacts with one-line reasons), one observation (e.g. "most enquiries are Banglish on WhatsApp").
- AI must not compute or invent numbers; prompt says to use only the provided figures. English output.

### 7.6 AI design principles to state in the video and note

1. AI where judgement is needed; code where it isn't (normalisation, duplicates, overdue, arithmetic).
2. AI never invents facts; replies are grounded in an FAQ the team controls.
3. AI admits uncertainty (`low_confidence_fields`), and a human confirms.
4. We measured it (eval table), and we show where it fails.

---

## 8. Screens (4 screens + header)

**Header (all screens):** app name, nav, demo clock, "Paste message" button, counts of urgent and overdue.

**S1 Pipeline board** (home; the centre of the video)
- Columns: New, Contacted, Interested, Paid, Lost, with count and total team size for corporate.
- Cards: name, channel icon, interest chip, language chip (বাংলা / Banglish / EN), priority badge, overdue badge, flags as small icons (duplicate, unverified payment, refund, public complaint risk, minor), one-line summary.
- Drag-and-drop to change status (writes an Activity).
- Filters: interest, channel, priority, overdue only.
- Side tray, collapsed by default: **Not a lead** (spam, irrelevant) and a **Support** lane highlight for support/complaint types.

**S2 Enquiry detail** (drawer or page)
- Fields (editable), low-confidence fields highlighted in amber with "AI unsure, please check".
- Priority + reason; flags with plain-language explanations.
- Timeline: every inbound message (original text, Bangla rendered properly), replies sent, status changes, merge events.
- Reply panel: suggested reply, language switch (বাংলা / Banglish / English), "Copy", "Mark as sent", "Regenerate", FAQ keys used, "needs confirmation" list, "check before sending" warning if the number guard fired.
- Small meta line: model used, latency.

**S3 Paste a message (intake)**
- Inputs: channel (select), sender name, phone (optional), received time (default demo now), message.
- "Analyse" → shows extracted fields for review (with low-confidence highlights) → "Save". If the phone matches an existing contact, show "Will merge with Rafi Ahmed" before saving.
- 3 one-click sample buttons with **invented** messages (one Bangla, one Banglish, one English) for the live demo.

**S4 Follow-ups + Weekly summary**
- Overdue list (sorted urgent first), "due today" list, each with a one-click open.
- "Generate weekly summary" → renders the AI summary with a "Chase first" list linking to contacts.
- "Export CSV" (D8, optional).

**Design:** Tailwind, clean and calm, generous spacing. Font stack with Bangla support (e.g. "Hind Siliguri" or "Noto Sans Bengali" + Inter). Consistent colour meaning: red = urgent/overdue, amber = needs check, grey = not a lead. Empty, loading and error states for every AI call (AI calls must never freeze the UI).

---

## 9. API (FastAPI, under `/api`)

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/meta` | Enums (statuses, interests, languages, priorities, flags), demo clock |
| GET | `/api/contacts` | List with filters (`status`, `interest`, `channel`, `priority`, `overdue`, `type`) |
| GET | `/api/contacts/{id}` | Detail + enquiries + activities + latest reply draft |
| PATCH | `/api/contacts/{id}` | Edit fields / status |
| POST | `/api/intake/analyse` | Run extraction on a pasted message (no save) |
| POST | `/api/intake/save` | Save analysed message (merge if duplicate) |
| POST | `/api/contacts/{id}/reply` | Generate reply (`language` optional) |
| POST | `/api/contacts/{id}/reply/sent` | Mark as sent |
| GET | `/api/followups` | Overdue + due today |
| POST | `/api/summary/weekly` | Generate weekly summary |
| GET | `/api/export.csv` | Pipeline export (optional) |
| POST | `/api/demo/reset` | Reset DB to seeded state (for demos and the live call) |
| PUT | `/api/demo/clock` | Set demo now |

---

## 10. Evaluation plan

### 10.1 Extraction eval (`eval/run_eval.py`)

- Runs all 20 CSV rows through extraction (live), compares with `eval/gold.json` using its `conventions.scoring` rules, and writes outputs to `backend/seed/ai_results.json` (used for seeding).
- Also checks the system-side expectations (`system_expected`) by running `normalize.py` over the results.
- Prints a per-field table, then every mismatch: id, field, expected, got, plus the message.
- Saves `eval/report.md` (table + mismatches + model + date) for the note and the video.
- Flags: `--model deepseek|gemini`, `--ids 2,7,13,18` (e.g. Bangla only), `--no-save`.

**Targets** (must hit before M6):

| Field | Target |
|---|---|
| message_type | ≥ 19/20 |
| language | ≥ 19/20 |
| status | ≥ 19/20 |
| interest | ≥ 17/20 |
| priority (within one level) | ≥ 18/20 |
| name | ≥ 18/20 |
| follow_up_by date (#3, #5, #16) | 3/3 |
| flags recall | ≥ 85% |
| System: normalised phone, missing phone, duplicate, merged priority | 100% |
| Valid JSON on first try | ≥ 19/20 |

If a target is missed after two prompt iterations, ship anyway and report the honest number with the reason. An honest 17/20 explained well beats a hidden failure.

### 10.2 Reply checks (`eval/run_reply_checks.py`, M5)

Automated, over all 20 seeded contacts:
- Language match: Bangla rows contain Bangla script; non-Bangla rows contain none. Banglish vs English checked by a small heuristic word list (report only).
- Format: spam → `none`; phone notes → `call_script`; Facebook comments → `public_comment` and ≤ 2 sentences.
- Grounding: number guard reports any number not in FAQ or customer message (target: 0).
- Missing phone → reply asks for a number (non-public, non-spam).

Plus a manual review: print all 20 replies to `eval/replies.md`; the owner reads them once and fixes tone in the prompt.

### 10.3 Code tests (`pytest`, M3)

- Phone normalisation: `০১৭১১০০০০০১`, `+8801711000001`, `01711-000001` → `01711000001`.
- Rafi merge: rows #1 + #12 → one contact, two enquiries, priority `urgent`, flag `repeat_no_reply`.
- Missing phone count = 6.
- Overdue with demo clock `2026-10-28T12:00`: #16 overdue (follow-up by 27 Oct 17:00); a contact marked "sent" is not overdue.
- Reseed: empty DB → 19 contacts (20 messages, one merge).

---

## 11. Milestones

Work in order. At the end of each milestone: tick the boxes, run the checks listed, commit, and **stop for review**. Time budgets are targets, not limits; if a milestone overruns by 50%, cut scope from §4.3, never from §4.1.

### M0: Repo setup (0.5h)
- [x] uv project, FastAPI, SQLModel, pytest, ruff; Vite + React + TS + Tailwind in `frontend/`
- [x] `.env.example` with all env vars; `.env` git-ignored
- [x] `backend/seed/` contains `enquiries.csv` and `TASK README.md`
- **Done when:** `uv run fastapi dev backend/main.py` serves `/api/meta`, and `npm run dev` shows a page calling it.

### M1: AI core + extraction eval (3h)
- [x] `ai/client.py`: DeepSeek → Gemini fallback, JSON mode, Pydantic validation, one retry, timeout, `model_used` + `latency_ms`
- [x] `eval/run_eval.py` as in §10.1, writes `ai_results.json` and `eval/report.md`
- [x] Iterate on `prompts.py` until targets in §10.1 are met (max 2–3 rounds)
- [x] Decide Bangla routing from the numbers
- **Done when:** report shows targets met (or honest numbers with reasons), and `ai_results.json` has 20 valid entries.

### M2: Deploy smoke test (1h)
- [x] Frontend builds into `backend/static`; `app.frontend("/", directory="static")` serves it
- [x] Deployed to FastAPI Cloud with env vars; `/api/meta` and the page work from the public URL
- [x] Confirm whether the SQLite file survives a redeploy; record the answer in `NOTE.md` draft
- **Done when:** a public URL shows the placeholder page and calls the API.

### M3: Data layer + code rules (3h)
- [x] Tables (§6), `normalize.py` rules 1–7, demo clock
- [x] Reseed on boot from CSV + `ai_results.json` when DB is empty; `POST /api/demo/reset`
- [x] `pytest` tests in §10.3 all pass
- **Done when:** fresh start → 19 contacts, Rafi merged and `urgent`, 6 missing phones, spam and job seeker out of the pipeline.

### M4: API (2h)
- [x] All endpoints in §9 except reply, summary and export
- [x] Intake analyse/save with duplicate preview
- **Done when:** every endpoint works from `/docs`; intake of an invented Banglish message creates a correct contact.

### M5: Replies + FAQ (2.5h)
- [x] `faq.yaml` (§7.4), reply prompt + `SuggestedReply` model (§7.3), number guard
- [x] Pre-generate replies for all seeded contacts into the seed (so the demo needs no live call)
- [x] `eval/run_reply_checks.py` and `eval/replies.md`
- **Done when:** checks in §10.2 pass; #7 asks for the bKash transaction ID; #16 is a call script; #11 has no reply; #17 does not claim government approval.

### M6: Frontend (6h)
- [ ] S1 Pipeline board with drag-and-drop, badges, filters, Not-a-lead tray
- [ ] S3 Intake with review step, merge preview, 3 invented sample buttons
- [ ] S2 Detail with timeline, low-confidence highlights, reply panel + language switch, copy, mark as sent
- [ ] Header with demo clock and urgent/overdue counts
- **Done when:** the full demo script (§12) runs in the browser on the local build with no console errors.

### M7: Extras (2h)
- [ ] S4 Follow-ups (overdue + due today)
- [ ] Weekly summary (§7.5)
- [ ] CSV export (only if ahead of schedule)
- **Done when:** summary names Habibur (#16) and Rafi among "chase first", and every number in it matches the code-computed figures.

### M8: Polish + Bangla (2h)
- [ ] Bangla font, rendering check on every screen; chips show বাংলা / Banglish / EN
- [ ] Loading, empty and error states on every AI call; AI failure never breaks the page
- [ ] Copy pass: all labels short and clear; demo FAQ note visible
- **Done when:** a non-technical person could use S1 → S2 → reply without explanation.

### M9: Final deploy + verification (1h)
- [ ] Deployed build matches local; reset endpoint works on prod
- [ ] Run the demo script (§12) on the public URL end to end
- [ ] Re-run `eval/run_eval.py --no-save` and `pytest`; save final numbers in `eval/report.md`
- **Done when:** the public URL passes the full demo script twice in a row.

### M10: Deliverables (3h; owner-led, Claude Code assists)
- [ ] `NOTE.md` (§13.2), max half a page
- [ ] `README.md`: what it is, live link, how to run locally, how to run eval, project structure
- [ ] Loom script finalised (§12); 2 practice runs; record; check it is ≤ 5:00
- [ ] Submission: Loom link, live link, repo link, `NOTE.md`
- **Done when:** all four items are in the submission email draft.

### M11: Live-change rehearsal (1h)
The shortlist call includes "one small change live". Practise these, each in ≤ 10 minutes, then reset:
- [ ] Add a new field (e.g. "district") end to end: schema → prompt → DB → UI
- [ ] Add a new pipeline status (e.g. "Meeting") via the enum; board updates from `/api/meta`
- [ ] Add a new channel (e.g. "Instagram")
- [ ] Change reply tone (e.g. more formal) in the prompt
- [ ] Add a filter to the board
- **Done when:** each change works and the owner can explain where it lives in the code.

**Suggested schedule (Dhaka time):** Wed morning M0–M2 · Wed afternoon M3–M4 · Wed evening M5 · Thu early M6 · Thu late morning M7–M8 · **Thu 12:00 feature freeze** · Thu afternoon M9–M10 · M11 before the call.

---

## 12. Demo script (Loom, ≤ 5:00)

The product is built so that this script works every time. Use the deployed URL with a fresh `/api/demo/reset` and demo clock `2026-10-28 12:00`.

| Time | Beat | On screen | Rubric line |
|---|---|---|---|
| 0:00–0:25 | The problem in BIAI's words: four channels, lost enquiries, no follow-up view | Board loads: 17 in the pipeline, 2 in the Not-a-lead tray | Loom, usability |
| 0:25–1:10 | **Morning routine:** urgent and overdue at a glance; Habibur's refund threat at the top; spam and job seeker kept out in the tray | S1, open #16, show call script | Usability, smart AI |
| 1:10–1:50 | **Lost enquiry caught:** Rafi asked twice, merged, escalated to urgent; one click → Banglish reply → mark as sent → moves to Contacted | S2 timeline, reply | Usability, Bangla |
| 1:50–2:40 | **Live paste:** an invented Bangla message from a company → fields fill, team size from Bangla digits, priority high with reason, low-confidence field highlighted; reply in Bangla, switch to Banglish | S3 → S2 | Smart AI, Bangla, works end to end |
| 2:40–3:15 | **No invented facts:** certificate question (#17) → reply only says what the FAQ says; number guard explained in one line | S2 reply panel | Smart AI, explain choices |
| 3:15–3:45 | **Weekly summary:** numbers from code, words from AI, "chase first" list | S4 | Extras, smart AI |
| 3:45–4:25 | **We measured it:** eval table, one honest mismatch explained; AI where judgement is needed, code where it isn't; DeepSeek with Gemini fallback | `eval/report.md` | Smart AI, explain choices |
| 4:25–5:00 | What doesn't work yet + what's next; close on "BIAI could start using this tomorrow" | Slide or README | Explain choices, Loom |

Tips: face cam on, speak to BIAI's problem not the tech stack, rehearse transitions, no dead air while AI loads (narrate during calls), keep the browser at 110–125% zoom.

---

## 13. Deliverables (from the brief)

### 13.1 Checklist
1. Loom video, ≤ 5 minutes (§12)
2. Working link (FastAPI Cloud)
3. The work: GitHub repo link
4. Short note, half a page (`NOTE.md`)

### 13.2 `NOTE.md` structure (≤ half a page)
- **What I built:** two sentences.
- **AI tools and how I used them:** Claude Code (built the app from this PRD, milestone by milestone, with review at each step); DeepSeek (extraction, replies, summary); Gemini (fallback [+ Bangla routing if chosen]); eval-driven prompt iteration.
- **What does not work yet:** honest list, e.g. no merge for contacts without phones; FAQ values are placeholders; SQLite may reset on redeploy; Banglish vs English detection can confuse very short messages; no real channel integrations.
- **What I would fix next:** WhatsApp Business API intake; persistent Postgres; name-based duplicate suggestions; staff feedback loop on AI fields to grow the eval set.
- **Eval result:** one line with the headline numbers.

---

## 14. Key decisions (record rationale in `NOTE.md`)

| Decision | Why |
|---|---|
| Bangla-script senders get Bangla-script replies (brief says English or Banglish) | Matching how the person wrote is the brief's intent; switch available in one click. |
| Message type before interest; spam/irrelevant kept out of pipeline | README explicitly asks how non-sales messages are handled. |
| `unclear` interest instead of guessing | Wrong guesses send wrong replies; "which program" goes to missing info. |
| AI sets only `New` / `Paid` on intake | Status changes are staff decisions; keeps the pipeline trustworthy. |
| Code, not AI, for duplicates / overdue / numbers | Deterministic, testable, explainable. |
| FAQ-grounded replies + number guard | A wrong price or policy is the costliest AI failure for BIAI. |
| DeepSeek first, Gemini fallback | Gemini free-tier quotas are too tight for primary use; fallback keeps the demo alive. |
| Pre-generated AI results seeded on boot | Demo and reviewers never depend on live API quota. |
| Demo clock | Sample data is from late October; overdue logic must be demonstrable. |

---

## 15. Risks and mitigations

| Risk | Mitigation |
|---|---|
| FastAPI Cloud wipes SQLite | Reseed on boot; `/api/demo/reset`; note it in limitations. Postgres (Neon/Supabase) only if needed. |
| AI rate limits / outage during review | Seeded AI results and replies; fallback model; clear error state in UI. |
| DeepSeek weak on Bangla | Measured in M1; route Bangla-script rows to Gemini if needed. |
| Hallucinated facts in replies | FAQ grounding + number guard + "needs confirmation" list. |
| Running out of time | Feature freeze Thu 12:00; cut §4.3 items from the bottom up; never cut M9–M10. |
| Live change on the call goes badly | M11 rehearsal; enums served from `/api/meta`; small, readable modules. |
| Video runs over 5 minutes | Script with timings; two practice runs. |

---

## 16. Definition of done (pre-submission)

- [ ] Public URL loads in under 3 seconds and passes the §12 script twice in a row
- [ ] All 20 sample enquiries visible and correctly placed (19 contacts, 2 in Not-a-lead, Rafi merged)
- [ ] `pytest` green; eval report saved with final numbers
- [ ] Every AI call has loading and error states; no console errors
- [ ] Bangla renders correctly on every screen
- [ ] No API keys in the repo; `.env.example` present
- [ ] README, NOTE, Loom (≤ 5:00), live link, repo link ready
- [ ] Live-change rehearsal done