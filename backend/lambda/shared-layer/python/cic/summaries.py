"""Completion and learning-gain summaries for classes and cohorts.

Shared by the admin cohort report and the read API. Completion is the share of
(active student, assigned module) pairs whose module is complete. Gain pools every
(student, module) pretest and post-test pair.
"""
from typing import Dict, List, Optional

from . import classdata, gain

DEFINITIONS = {
    **gain.DEFINITIONS,
    "completionPct": "share of (active student, assigned module) pairs where the module is complete",
    "startedPct": "share of those pairs where the student has started the module",
}


def class_stats(class_id: str) -> dict:
    data = classdata.load_class(class_id)
    active = {data.student_id(r) for r in data.active_roster}
    modules = []
    for a in data.assignments:
        module_id = a["moduleId"]
        states = {sid: i for sid, i in classdata.module_states(class_id, module_id).items() if sid in active}
        assess = {sid: p for sid, p in classdata.class_assessments(class_id, module_id).items() if sid in active}
        pairs = [(p["pre"]["scorePct"], p["post"]["scorePct"]) for p in assess.values() if p.get("pre") and p.get("post")]
        modules.append({
            "moduleId": module_id, "title": data.modules[module_id].get("title"), "enrolled": len(active),
            "started": len(states), "complete": sum(1 for i in states.values() if i.get("state") == "complete"),
            "pairs": pairs, "concepts": gain.concept_pairs(assess),
        })
    return {"classId": class_id, "name": data.meta.get("name"), "enrolled": len(active), "modules": modules}


def _pct(part: int, whole: int) -> Optional[float]:
    return round(part / whole * 100, 1) if whole else None


def _rollup(stats: List[dict], suppress: bool) -> dict:
    """Combine class_stats results into one completion and gain summary, plus per-module rows."""
    total = sum(m["enrolled"] for s in stats for m in s["modules"])
    complete = sum(m["complete"] for s in stats for m in s["modules"])
    started = sum(m["started"] for s in stats for m in s["modules"])
    enrolled = sum(s["enrolled"] for s in stats)
    pairs = [p for s in stats for m in s["modules"] for p in m["pairs"]]
    finish = gain.suppress if suppress else (lambda x: x)
    by_module: Dict[str, dict] = {}
    for s in stats:
        for m in s["modules"]:
            row = by_module.setdefault(m["moduleId"], {"moduleId": m["moduleId"], "title": m["title"], "enrolled": 0, "complete": 0, "pairs": []})
            row["enrolled"] += m["enrolled"]
            row["complete"] += m["complete"]
            row["pairs"] += m["pairs"]
    module_rows = [{"moduleId": r["moduleId"], "title": r["title"], "completionPct": _pct(r["complete"], r["enrolled"]),
                    **finish(gain.summarize(r["pairs"], r["enrolled"]))} for r in by_module.values()]
    return {"enrolled": enrolled, "classes": len(stats), "assignedModules": len(by_module),
            "completion": {"completionPct": _pct(complete, total), "startedPct": _pct(started, total)},
            "learningGain": finish(gain.summarize(pairs, enrolled)), "byModule": module_rows}


def class_summary(class_id: str, suppress: bool = False) -> dict:
    stats = class_stats(class_id)
    return {"classId": class_id, "name": stats["name"], **_rollup([stats], suppress), "definitions": DEFINITIONS}


def cohort_summary(cohort_id: str, suppress: bool = False) -> dict:
    stats = [class_stats(c) for c in classdata.classes_in_cohort(cohort_id)]
    finish = gain.suppress if suppress else (lambda x: x)
    by_class = []
    for s in stats:
        pairs = [p for m in s["modules"] for p in m["pairs"]]
        total = sum(m["enrolled"] for m in s["modules"])
        by_class.append({"classId": s["classId"], "name": s["name"], "enrolled": s["enrolled"],
                         "completionPct": _pct(sum(m["complete"] for m in s["modules"]), total),
                         **finish(gain.summarize(pairs, s["enrolled"]))})
    return {"cohortId": cohort_id, **_rollup(stats, suppress), "byClass": by_class, "definitions": DEFINITIONS}


def concept_gain(class_ids: List[str], suppress: bool = False) -> List[dict]:
    """Gain and mastery per concept pooled across the given classes and all their modules."""
    parts = [m["concepts"] for c in class_ids for m in class_stats(c)["modules"]]
    rows = gain.concept_rows(gain.merge_concept_pairs(parts))
    if not suppress:
        return rows
    out = []
    for row in rows:
        row = gain.suppress(row)
        if row["postN"] < gain.MIN_GROUP_SIZE:
            row = {**row, "masteryPct": None}
        out.append(row)
    return out
