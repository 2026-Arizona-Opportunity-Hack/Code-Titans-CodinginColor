import pytest

from cic.errors import ValidationError
from cic.grading import grade, is_correct, parse_answers

QUESTIONS = [
    {"questionId": "q1", "type": "mcq", "answerKey": "b", "concept": "loops", "points": 2, "explanation": "why"},
    {"questionId": "q2", "type": "multi", "answerKey": ["a", "c"], "concept": "loops"},
    {"questionId": "q3", "type": "short", "answerKey": ["For Loop", "for-loop"], "concept": "syntax"},
    {"questionId": "q4", "type": "numeric", "answerKey": {"value": 3.14, "tolerance": 0.01}, "concept": "math"},
]


def test_each_question_type():
    assert is_correct(QUESTIONS[0], "b") and not is_correct(QUESTIONS[0], "a")
    assert is_correct(QUESTIONS[1], ["c", "a"]) and not is_correct(QUESTIONS[1], ["a"])
    assert is_correct(QUESTIONS[2], "  for   LOOP ") and not is_correct(QUESTIONS[2], "while")
    assert is_correct(QUESTIONS[3], "3.145") and not is_correct(QUESTIONS[3], 3.2)
    assert not is_correct(QUESTIONS[3], "abc")  # bad number does not raise
    assert not is_correct(QUESTIONS[0], None)


def test_grade_scores_points_and_concepts():
    result = grade(QUESTIONS, {"q1": "b", "q2": ["a"], "q3": "for loop", "q4": 3.14})
    assert (result.points, result.max_points) == (4.0, 5.0)
    assert result.pct == 80.0
    assert result.by_concept["loops"] == {"correct": 2.0, "total": 3.0, "items": 2}
    assert result.by_concept["syntax"]["correct"] == 1.0
    assert result.results[0]["explanation"] == "why"


def test_unanswered_scores_zero_and_missing_concept_goes_to_general():
    result = grade([{"questionId": "x", "type": "mcq", "answerKey": "a"}], {})
    assert result.pct == 0.0 and "general" in result.by_concept


def test_parse_answers_rejects_unknown_ids_and_bad_shapes():
    ids = {"q1", "q2"}
    assert parse_answers([{"questionId": "q1", "value": "a"}], ids) == {"q1": "a"}
    for bad in ("x", [{"questionId": "zzz", "value": "a"}], [{"questionId": "q1", "value": {"a": 1}}],
                [{"questionId": "q1", "value": "a" * 3000}], [1]):
        with pytest.raises(ValidationError):
            parse_answers(bad, ids)


def test_numeric_answer_with_null_tolerance_still_grades():
    q = {"questionId": "n", "type": "numeric", "answerKey": {"value": 3, "tolerance": None}}
    assert is_correct(q, 3) and not is_correct(q, 3.5)
