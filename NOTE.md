# BIAI CRM: note

**What I built.** A CRM where staff paste any enquiry (Bangla, Banglish or English; WhatsApp, Facebook, website
or a call note) and the AI files it (who, what they want, priority with a reason) and drafts a reply from BIAI's
FAQ. A Today screen shows who to answer first. Live: https://biai-crm.fastapicloud.dev

**Key choices.**
- **Bangla script gets a Bangla script reply.** The brief says "English or Banglish, matching how the person
  wrote"; four samples are in Bangla script, and answering them in Banglish would not match how they wrote. Staff
  can switch any reply to Banglish or English in one click.
- **AI for judgement, code for rules.** The AI reads one message at a time; duplicates, the 48-hour rule,
  escalation and every number in the weekly summary are plain, tested code.
- **The demo needs no live AI.** The 20 samples' AI results, replies and summary are pre-generated, so the demo
  works even if the AI is down; only new messages call it.

**AI tools.** Claude Code built the app from my PRD, milestone by milestone; I reviewed each one, redirected
(card sorting, a UI redesign, overdue rules) and tested it in a browser. DeepSeek does extraction, replies and the
summary, with Gemini as fallback. I hand-labelled the 20 samples and improved prompts only from eval mismatches.

**Eval.** 20/20 on message type, language, status, interest and name; follow-up dates 3/3; flags 9/9; priority
20/20 within one level. All 55 pre-written replies pass the language, format and no-invented-facts checks.

**What does not work yet.** No merging for contacts without a phone; placeholder FAQ; data resets on every deploy;
no real WhatsApp / Facebook connection, sending or logins; the Gemini fallback often hits free-tier limits; 20 samples that also guided the prompts overstate real accuracy.

**Next.** WhatsApp and Messenger webhooks, Postgres with logins, name-based duplicate hints, BIAI's real FAQ.
