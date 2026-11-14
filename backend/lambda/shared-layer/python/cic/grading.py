"""Server-side grading. Answer keys never leave the server for student requests.

Question types: mcq (one choice id), multi (set of choice ids), short (accepted
strings, case and spacing ignored), numeric (number within an optional tolerance).
"""
from dataclasses import dataclass, field
from typing import Any, Dict, List

from .errors import ValidationError

MAX_ANSWER_CHARS = 2000
MAX_ANSWERS = 200
GENERAL = "general"


@dataclass
class GradeResult:
    points: float
    max_points: float
    results: List[dict] = field(default_factory=list)
    by_concept: Dict[str, dict] = field(default_factory=dict)

    @property
    def pct(self) -> float:
        return round(self.points / self.max_points * 100, 1) if self.max_points else 0.0


def _norm(text: Any) -> str:
    return " ".join(str(text).lower().split())


def is_correct(question: dict, value: Any) -> bool:
    key = question.get("answerKey")
    kind = question.get("type")
    if value is None or key is None:
        return False
    if kind == "mcq":
        return isinstance(value, str) and value == key
    if kind == "multi":
        return isinstance(value, list) and set(map(str, value)) == set(map(str, key))
    if kind == "short":
        accepted = key if isinstance(key, list) else [key]
        return _norm(value) in {_norm(a) for a in accepted}
    if kind == "numeric":
        try:
            target = float(key["value"] if isinstance(key, dict) else key)
            tol = float(key.get("tolerance", 0)) if isinstance(key, dict) else 0.0
            return abs(float(value) - target) <= tol
        except (TypeError, ValueError):
            return False
    return False


def parse_answers(raw: Any, valid_ids: set) -> Dict[str, Any]:
    """Validate the answers array from a request and return {questionId: value}."""
    if not isinstance(raw, list) or len(raw) > MAX_ANSWERS:
        raise ValidationError("answers must be a list")
    out: Dict[str, Any] = {}
    for item in raw:
        if not isinstance(item, dict) or item.get("questionId") not in valid_ids:
            raise ValidationError("Unknown questionId in answers")
        value = item.get("value")
        if isinstance(value, str) and len(value) > MAX_ANSWER_CHARS:
            raise ValidationError("Answer is too long")
        if isinstance(value, list) and (len(value) > 50 or any(not isinstance(v, (str, int)) for v in value)):
            raise ValidationError("Invalid answer")
        if value is not None and not isinstance(value, (str, int, float, list)):
            raise ValidationError("Invalid answer")
        out[item["questionId"]] = value
    return out


def grade(questions: List[dict], answers: Dict[str, Any]) -> GradeResult:
    result = GradeResult(points=0.0, max_points=0.0)
    for q in questions:
        pts = float(q.get("points", 1))
        ok = is_correct(q, answers.get(q["questionId"]))
        concept = q.get("concept") or GENERAL
        bucket = result.by_concept.setdefault(concept, {"correct": 0.0, "total": 0.0, "items": 0})
        bucket["total"] += pts
        bucket["items"] += 1
        result.max_points += pts
        if ok:
            result.points += pts
            bucket["correct"] += pts
        result.results.append({"questionId": q["questionId"], "correct": ok, "points": pts if ok else 0.0, "explanation": q.get("explanation")})
    return result
