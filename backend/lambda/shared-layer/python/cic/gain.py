"""Learning gain, defined once (docs/architecture.md section 7.5) and shared by the
instructor reports and the read API.

Scores are percentages from 0 to 100. A student counts only if they have both a
pretest and a post-test. Small groups are suppressed for the read API.
"""
from statistics import mean
from typing import Dict, List, Optional

MIN_GROUP_SIZE = 5
LOW_ITEM_COUNT = 3

DEFINITIONS = {
    "gain": "post - pre, in percentage points",
    "normalizedGain": "(post - pre) / (100 - pre); undefined when pre = 100",
    "classNormalizedGain": "(mean post - mean pre) / (100 - mean pre)",
    "n": "students with both a pretest and a post-test",
}


def _f(value) -> float:
    return float(value)


def _round(value: Optional[float], places: int = 1) -> Optional[float]:
    return None if value is None else round(value, places)


def student_gain(pre: float, post: float) -> dict:
    pre, post = _f(pre), _f(post)
    normalized = (post - pre) / (100 - pre) if pre < 100 else None
    return {"pre": _round(pre), "post": _round(post), "gain": _round(post - pre), "normalizedGain": _round(normalized, 2)}


def summarize(pairs: List[tuple], enrolled: Optional[int] = None) -> dict:
    """Summary for a group from (pre, post) score pairs."""
    n = len(pairs)
    summary = {"nEnrolled": enrolled, "n": n, "meanPre": None, "meanPost": None, "meanGain": None, "normalizedGain": None}
    if not n:
        return summary
    mean_pre = mean(_f(p) for p, _ in pairs)
    mean_post = mean(_f(q) for _, q in pairs)
    summary.update(
        meanPre=_round(mean_pre),
        meanPost=_round(mean_post),
        meanGain=_round(mean_post - mean_pre),
        normalizedGain=_round((mean_post - mean_pre) / (100 - mean_pre), 2) if mean_pre < 100 else None,
    )
    return summary


def suppress(summary: dict, min_n: int = MIN_GROUP_SIZE) -> dict:
    """Hide metrics for groups too small to be anonymous (read API)."""
    if summary["n"] >= min_n:
        return {**summary, "suppressed": False}
    hidden = {k: None for k in ("meanPre", "meanPost", "meanGain", "normalizedGain")}
    return {**summary, **hidden, "suppressed": True}


def _concept_pct(item: dict, concept: str):
    c = (item.get("byConcept") or {}).get(concept)
    if not c or not _f(c.get("total", 0)):
        return None, 0
    return _f(c["correct"]) / _f(c["total"]) * 100, int(c.get("items", 0))


MASTERY_PCT = 80


def concept_pairs(assessments: Dict[str, dict]) -> Dict[str, dict]:
    """Collect, per concept, the (pre, post) pairs, item counts and post-test scores."""
    out: Dict[str, dict] = {}
    for pair in assessments.values():
        for role in ("pre", "post"):
            for concept in (pair.get(role) or {}).get("byConcept") or {}:
                out.setdefault(concept, {"pairs": [], "pre_items": 0, "post_items": 0, "post_scores": []})
    for concept, bucket in out.items():
        for pair in assessments.values():
            pre, post = pair.get("pre"), pair.get("post")
            post_pct, post_n = _concept_pct(post, concept) if post else (None, 0)
            if post_pct is not None:
                bucket["post_scores"].append(post_pct)
            pre_pct, pre_n = _concept_pct(pre, concept) if pre else (None, 0)
            if pre_pct is not None and post_pct is not None:
                bucket["pairs"].append((pre_pct, post_pct))
                bucket["pre_items"], bucket["post_items"] = max(bucket["pre_items"], pre_n), max(bucket["post_items"], post_n)
    return out


def merge_concept_pairs(parts: List[Dict[str, dict]]) -> Dict[str, dict]:
    """Combine concept_pairs results from several modules."""
    merged: Dict[str, dict] = {}
    for part in parts:
        for concept, b in part.items():
            m = merged.setdefault(concept, {"pairs": [], "pre_items": 0, "post_items": 0, "post_scores": []})
            m["pairs"] += b["pairs"]
            m["post_scores"] += b["post_scores"]
            m["pre_items"] += b["pre_items"]
            m["post_items"] += b["post_items"]
    return merged


def concept_rows(pairs_by_concept: Dict[str, dict]) -> List[dict]:
    """Gain and mastery per concept. masteryPct is the share of post-tested students at or above 80%."""
    rows = []
    for concept in sorted(pairs_by_concept):
        b = pairs_by_concept[concept]
        row = summarize(b["pairs"])
        scores = b["post_scores"]
        row.update(
            concept=concept,
            lowItemCount=min(b["pre_items"], b["post_items"]) < LOW_ITEM_COUNT,
            postN=len(scores),
            masteryPct=round(sum(1 for x in scores if x >= MASTERY_PCT) / len(scores) * 100) if scores else None,
        )
        rows.append(row)
    return rows


def by_concept(assessments: Dict[str, dict]) -> List[dict]:
    """Per-concept gain. `assessments` is {studentId: {"pre": item, "post": item}}."""
    return concept_rows(concept_pairs(assessments))


def module_gain(assessments: Dict[str, dict], enrolled: int) -> dict:
    """Class gain for one module, with per-student rows and a per-concept breakdown."""
    students, pairs = [], []
    for student_id, pair in assessments.items():
        pre, post = pair.get("pre"), pair.get("post")
        row = {"studentId": student_id, "pre": None, "post": None, "gain": None, "normalizedGain": None}
        if pre and post:
            row.update(student_gain(pre["scorePct"], post["scorePct"]))
            pairs.append((pre["scorePct"], post["scorePct"]))
        else:
            row["pre"] = _round(_f(pre["scorePct"])) if pre else None
            row["post"] = _round(_f(post["scorePct"])) if post else None
        students.append(row)
    return {"class": summarize(pairs, enrolled), "byConcept": by_concept(assessments), "students": students}
