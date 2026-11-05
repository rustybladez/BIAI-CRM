"""
Structured output the AI must return for ONE enquiry.

Rule of thumb for this file:
- The AI only fills what it can judge from a single message.
- Anything that needs other records or arithmetic (duplicates, missing phone,
  48h overdue, phone normalisation) is done in plain code, not here.
"""
from enum import Enum
from typing import Literal, get_args

from pydantic import BaseModel, Field

Channel = Literal["WhatsApp", "Facebook Messenger", "Facebook comment", "Website form", "Phone call note"]
CHANNELS: list[str] = list(get_args(Channel))


class MessageType(str, Enum):
    lead = "lead"                # wants to buy / learn about a program
    support = "support"          # existing customer with a problem (payment, access)
    complaint = "complaint"      # unhappy customer, refund/cancel, escalation risk
    spam = "spam"                # ads, scams, links
    irrelevant = "irrelevant"    # real person, but not a customer (e.g. job seeker)


class Interest(str, Enum):
    bootcamp = "bootcamp"
    fellowship = "fellowship"
    corporate = "corporate"            # training for a company / team
    other = "other"                    # names something else (e.g. free masterclass)
    unclear = "unclear"                # a prospect, but the program is not stated
    not_applicable = "not_applicable"  # spam / irrelevant


class Language(str, Enum):
    bangla = "bangla"        # Bangla script
    banglish = "banglish"    # Bangla written in Latin letters
    english = "english"


class Status(str, Enum):
    new = "New"
    contacted = "Contacted"
    interested = "Interested"
    paid = "Paid"
    lost = "Lost"


class Priority(str, Enum):
    urgent = "urgent"   # act today: angry customer, refund, public complaint threat
    high = "high"       # corporate deal, money stuck, clear buying signal
    medium = "medium"   # normal sales question
    low = "low"         # vague, very early, or unlikely to convert


class AIFlag(str, Enum):
    payment_unverified = "payment_unverified"        # says they paid, we have no proof yet
    refund_request = "refund_request"                # wants cancel / money back
    public_complaint_risk = "public_complaint_risk"  # threatens to post publicly
    minor = "minor"                                  # sender appears to be under 18
    callback_requested = "callback_requested"        # asked us to call, or said they will call
    group_or_bulk = "group_or_bulk"                  # several people / employees
    multiple_enquiries = "multiple_enquiries"        # paste holds several enquiries; only the first was read


class ExtractedEnquiry(BaseModel):
    message_type: MessageType
    message_type_reason: str = Field(description="One short English sentence.")

    name: str | None = Field(None, description="Person's name only, no role or company.")
    role: str | None = Field(None, description="Job title if stated, e.g. 'HR', 'Owner'.")
    company: str | None = Field(None, description="Company name or description if stated.")
    team_size: int | None = Field(None, description="Number of people to train, if stated.")
    phone_in_message: str | None = Field(
        None, description="Phone number written inside the message text, copied as-is. Null if none."
    )
    channel_in_message: Channel | None = Field(
        None,
        description="Channel ONLY if the paste states it (e.g. a 'WhatsApp' column) or it is obvious "
        "(e.g. 'Call note:'). Null otherwise. Never guess.",
    )
    received_at_in_message: str | None = Field(
        None,
        description="When the enquiry was received, Dhaka time 'YYYY-MM-DDTHH:MM', ONLY if the paste "
        "contains that date or time (e.g. a timestamp column). Null otherwise. Never guess.",
    )

    interest: Interest
    interest_detail: str | None = Field(
        None, description="What exactly they asked, in English, max ~12 words."
    )
    language: Language

    status: Status | None = Field(
        None, description="Pipeline status. Null only for spam and irrelevant."
    )
    suggested_status: Status | None = Field(
        None,
        description="Stage change THIS message signals, if any: Interested (clear intent to buy: asks payment "
        "details, says they will join, wants the form or invoice, books a call), Lost (declines or goes "
        "elsewhere), Paid (says they paid). Null otherwise. Staff decide; it is never applied automatically.",
    )
    priority: Priority
    priority_reason: str = Field(description="One short English sentence.")

    follow_up_by: str | None = Field(
        None,
        description=(
            "Local Dhaka time 'YYYY-MM-DDTHH:MM' by which WE should contact THEM: they asked for a "
            "call or reply by a time ('call me tomorrow after 5 PM', 'this week e janaben'), said when "
            "they will call us, or set a deadline ('solve it today'). Null for times about anything "
            "else (when they want to join or start, when they paid, batch or exam dates). Null "
            "otherwise; code applies the default 48h rule."
        ),
    )
    flags: list[AIFlag] = Field(default_factory=list)

    summary: str = Field(description="One English sentence a staff member can scan.")
    missing_info: list[str] = Field(
        default_factory=list,
        description="Info we need before we can help, e.g. 'which program', 'phone number'.",
    )
    low_confidence_fields: list[str] = Field(
        default_factory=list,
        description="Names of fields above that are a guess and should be checked by a human.",
    )


# ---- Gold-file models (used by eval/run_eval.py) ----

class SystemExpected(BaseModel):
    """What plain code (not the AI) should produce for this message."""
    normalized_phone: str | None = None
    missing_phone: bool = False
    duplicate_of: int | None = None
    # Priority of the merged record after code-side rules (e.g. repeat ask, no reply -> urgent).
    priority_after_merge: Priority | None = None


class GoldItem(BaseModel):
    id: int
    expected: ExtractedEnquiry
    system_expected: SystemExpected
    notes: str = ""

# ---- Reply suggestion (PRD §7.3) ----


class ReplyFormat(str, Enum):
    text = "text"                      # normal chat / email reply
    public_comment = "public_comment"  # Facebook comment: short, public, invite to inbox
    call_script = "call_script"        # phone call note: what to say when calling back
    none = "none"                      # spam: no reply


class SuggestedReply(BaseModel):
    body: str = Field(description="The reply text, in the target language and format.")
    faq_keys_used: list[str] = Field(
        default_factory=list, description="Keys of the FAQ entries whose facts the reply uses."
    )
    needs_confirmation: list[str] = Field(
        default_factory=list,
        description="Questions the customer asked that the FAQ does not answer (short English).",
    )


# ---- Weekly summary (PRD §7.5). Numbers come from code; the AI writes the words. ----


class ChaseItem(BaseModel):
    contact_id: int = Field(description="contact_id from chase_candidates_ranked.")
    reason: str = Field(description="One short line: why chase them first.")


class WeeklySummary(BaseModel):
    overview: str = Field(description="3-5 sentences in English, using only the numbers provided.")
    chase_first: list[ChaseItem] = Field(description="Up to 5 contacts, most important first.")
    observation: str = Field(description="One useful pattern in the data, one or two sentences.")
