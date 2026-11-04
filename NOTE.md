# BIAI CRM: note

**What I built.** A small CRM where staff paste any enquiry (Bangla, Banglish or English; WhatsApp, Facebook,
website or a call note) and the AI files it: who it is, what they want, priority with a reason, and a reply in
their language using only facts from BIAI's FAQ. A Today screen shows who to answer first; duplicates, the 48 h
overdue rule and escalation are plain code. Live: https://biai-crm.fastapicloud.dev

**AI tools and how I used them.**
- **Claude Code** built the app from my PRD, milestone by milestone. I reviewed each one, changed direction
  where needed (card sorting, a full UI redesign) and tested each in a real browser.
- **DeepSeek** does extraction, replies and the weekly summary; **Gemini** is the fallback.
- I hand-labelled the 20 samples and improved prompts only from eval mismatches, never by putting samples in a
  prompt. Code checks every AI output: invented numbers or the wrong script in replies, numbers in the summary
  that are not in the data.

**Eval.** 20/20 on message type, language, status, interest and name; follow-up dates 3/3; flags 9/9; priority
20/20 within one level (19/20 exact). All 55 pre-written replies pass the language, format and no-invented-facts checks.

**What does not work yet.**
- Contacts without a phone number are never merged.
- FAQ values are placeholders; data resets to the samples on every deploy.
- No real WhatsApp / Facebook connection, no sending, no logins.
- The Gemini fallback often hits free-tier limits; if both AIs fail, staff fill the form by hand.
- 100% on 20 samples that also guided the prompts overstates real accuracy.

**What I would fix next.** WhatsApp Business and Messenger webhooks; Postgres with staff logins; name-based
duplicate suggestions; BIAI's real FAQ; staff corrections fed back into the eval set.
