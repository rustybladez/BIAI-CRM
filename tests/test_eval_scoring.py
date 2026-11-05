"""The eval scorer itself: gold vs gold must be perfect; known errors must be caught."""

import run_eval

from backend.ai.prompts import build_extraction_messages
from backend.seed.load import read_enquiries


def test_gold_scores_perfectly_against_itself():
    gold = run_eval.load_gold()
    scores = {i: run_eval.score_item(g, g.expected, True) for i, g in gold.items()}
    for field, correct, n, _target, met in run_eval.summarise(scores):
        assert correct == n, field
        assert met in (True, None), field
    assert run_eval.mismatches(scores, {}) == []


def test_scorer_catches_errors():
    g = run_eval.load_gold()[16]  # urgent complaint with a follow-up date and two flags
    got = g.expected.model_copy(
        update={"priority": "medium", "follow_up_by": "2026-10-28T17:00", "flags": []}
    )
    s = run_eval.score_item(g, got, False)
    assert s["priority (±1)"][0] is False  # urgent -> medium is two levels
    assert s["follow_up_by date"][0] is False
    assert s["flags"][:2] == (0, 2)
    assert s["valid JSON first try"][0] is False


def test_priority_within_one_level_counts():
    g = run_eval.load_gold()[1]  # high
    s = run_eval.score_item(g, g.expected.model_copy(update={"priority": "medium"}), True)
    assert s["priority (±1)"][0] is True and s["priority (exact)"][0] is False


def test_no_sample_enquiry_leaks_into_the_prompt():
    system = build_extraction_messages("WhatsApp", "2026-10-26 09:00", "x", None, "hi")[0]["content"]
    for row in read_enquiries():
        assert row.message not in system, f"sample #{row.id} is in the prompt"


def test_failed_call_counts_only_scored_fields():
    gold = run_eval.load_gold()
    scores = {i: run_eval.score_item(g, g.expected, True) for i, g in gold.items()}
    scores[11] = run_eval.score_item(gold[11], None, False)  # spam row: no follow-up, no team size
    table = {r[0]: r for r in run_eval.summarise(scores)}
    assert table["message_type"][1:3] == (19, 20)
    assert table["follow_up_by date"][1:3] == (3, 3)
    assert table["team_size"][1:3] == (3, 3)  # #3, #10, #18
    assert run_eval.mismatches(scores, {}) == ["| 11 | all fields | (valid output) | AI call failed |"]


def test_system_checks_pass_on_saved_ai_results():
    import json
    from pathlib import Path

    rows = {r.id: r for r in read_enquiries()}
    results = {i["id"]: i for i in json.loads(Path("backend/seed/ai_results.json").read_text())["items"]}
    assert run_eval.system_checks(run_eval.load_gold(), rows, results) == []


def test_empty_sender_and_channel_reach_the_prompt_as_blanks():
    user = build_extraction_messages(None, "2026-10-28 12:00", None, None, "hi", received_at_given=False)[1]
    assert user["content"].startswith("channel:  | received_at: 2026-10-28 12:00 (no time given;")
    assert "sender_name:  | phone: \n" in user["content"]
