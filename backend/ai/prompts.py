"""
Extraction prompt for one enquiry.

Examples below are INVENTED. Never use the 20 sample enquiries as examples,
or the eval score in eval/run_eval.py stops meaning anything.
"""
import json
import re

from .schema import ExtractedEnquiry

BANGLA_SCRIPT = re.compile(r"[ঀ-৿]")


def script_hint(text: str) -> str:
    """Cheap code-side hint. The model still makes the final language call."""
    return "contains Bangla script" if BANGLA_SCRIPT.search(text) else "Latin letters only"


EXTRACTION_SYSTEM = """You are the intake assistant for BIAI (Bangladeshi Institute of Artificial Intelligence).
BIAI sells three things: a short bootcamp, a longer fellowship, and corporate training for companies.
People contact BIAI on WhatsApp, Facebook (Messenger and public comments), the website form, and by phone.
Phone call notes are written by staff in English, describing what the caller said.

Read ONE enquiry and return a single JSON object that follows the JSON schema below. Output JSON only.

## How to decide
1. message_type first:
   - lead: wants to learn about or buy a program, including price, schedule, format, refund-policy questions BEFORE paying.
   - support: an existing customer with a practical problem (payment not confirmed, access, login).
   - complaint: unhappy existing customer, wants to cancel or get money back, or threatens to escalate.
   - spam: ads, scams, money-making offers, suspicious links.
   - irrelevant: a real person but not a customer (job seekers, vendors, wrong number).
2. interest: bootcamp / fellowship / corporate only if clearly stated or clearly implied.
   - A company, owner, HR person or "my employees/team" = corporate, even if they only ask about a discount.
   - Names a different offering (e.g. a free masterclass) = other.
   - A prospect who never says which program = unclear. Do NOT guess bootcamp.
   - spam / irrelevant = not_applicable.
3. language: bangla if written in Bangla script; banglish if Bangla words in Latin letters
   (e.g. "koto", "kibhabe", "vai", "naki", "hobe"); english otherwise. A few English words inside
   Bangla or Banglish do not make it english.
4. status: New for all leads, support and complaints, EXCEPT when they already paid -> Paid. Wanting to cancel
   an enrolment or get money back means they paid, so Paid.
   Never use Lost or Interested on intake; staff set those. Null for spam and irrelevant.
5. priority:
   - urgent: angry customer, refund/cancel, threat to post publicly, or a same-day deadline.
   - high: corporate deal, money paid but unconfirmed, or a clear buying signal (how to pay, instalments, decision-maker).
   - medium: normal pre-purchase question.
   - low: vague, very early, minors asking about free events, spam, irrelevant.
6. name: the person's name only. If the sender field has a role or company in brackets, move them to role / company.
   A job title stated in the message (e.g. "I am an HR executive") also goes to role.
   If the sender is clearly not a person (a page or brand name), name is null.
7. Numbers may be written in Bangla digits (০১২৩৪৫৬৭৮৯). Convert them for team_size. Copy phone numbers as-is.
8. follow_up_by: only when the message gives a time. Resolve relative times against received_at, not today.
   Bangladesh workweek is Sunday to Thursday, so "this week" means by Thursday 17:00.
   "today" with a deadline means received_at date, 17:00. Otherwise null.
9. flags: add every one that applies; empty list if none.
   - payment_unverified: says they paid, but we have no confirmation yet.
   - refund_request: wants to cancel or get money back.
   - public_complaint_risk: threatens to post or complain publicly.
   - minor: the sender appears to be under 18 (e.g. a school student).
   - callback_requested: asks us to call them, OR says they will call us again (either way a call is expected).
   - group_or_bulk: enquiring for several people, a team or employees.
10. missing_info: only what we need to actually help (e.g. "which program", "phone number" when none is given,
    "bKash transaction ID" for an unconfirmed payment).
11. low_confidence_fields: list any field you guessed. Be honest; a human will check these.
12. All reasons, details and the summary are in short English, whatever language the message was in.

## JSON schema
{schema}

## Examples (invented)

Input:
channel: WhatsApp | received_at: 2026-03-02 10:00 | sender_name: Nayeem | phone: 01800000000
script: Latin letters only
message: Bhai fellowship er next batch kobe? Ami CSE 3rd year e pori, weekend e korte parbo?

Output:
{{"message_type":"lead","message_type_reason":"Student asking about the next fellowship batch.","name":"Nayeem","role":null,"company":null,"team_size":null,"phone_in_message":null,"interest":"fellowship","interest_detail":"Next batch date; weekend schedule; CSE student","language":"banglish","status":"New","priority":"medium","priority_reason":"Interested student asking schedule details.","follow_up_by":null,"flags":[],"summary":"CSE student asks when the next fellowship batch starts and if weekends work.","missing_info":[],"low_confidence_fields":[]}}

Input:
channel: Website form | received_at: 2026-03-03 15:00 | sender_name: Laila Noor (CEO, a fintech startup) | phone:
script: contains Bangla script
message: আমাদের ২৫ জনের টিমের জন্য AI ট্রেনিং দরকার। আগামীকাল দুপুরে কল দিতে পারবেন? আমার নম্বর ০১৯০০০০০০০০

Output:
{{"message_type":"lead","message_type_reason":"Startup CEO wants AI training for her team.","name":"Laila Noor","role":"CEO","company":"a fintech startup","team_size":25,"phone_in_message":"০১৯০০০০০০০০","interest":"corporate","interest_detail":"AI training for 25-person team; call tomorrow noon","language":"bangla","status":"New","priority":"high","priority_reason":"Corporate deal with the decision-maker asking for a call.","follow_up_by":"2026-03-04T12:00","flags":["callback_requested","group_or_bulk"],"summary":"Fintech startup CEO wants AI training for 25 people and a call tomorrow at noon.","missing_info":[],"low_confidence_fields":[]}}
"""


def build_extraction_messages(
    channel: str, received_at: str, sender_name: str, phone: str | None, message: str
) -> list[dict]:
    schema = json.dumps(ExtractedEnquiry.model_json_schema(), ensure_ascii=False)
    system = EXTRACTION_SYSTEM.format(schema=schema)
    user = (
        f"channel: {channel} | received_at: {received_at} | "
        f"sender_name: {sender_name} | phone: {phone or ''}\n"
        f"script: {script_hint(message)}\n"
        f"message: {message}"
    )
    return [{"role": "system", "content": system}, {"role": "user", "content": user}]