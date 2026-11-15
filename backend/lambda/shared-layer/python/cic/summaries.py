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


def _in_period(ts, from_ms: Optional[int], to_ms: Optional[int]) -> bool:
    if from_ms is None and to_ms is None:
        return True
    return ts is not None and (from_ms is None or int(ts) >= from_ms) and (to_ms is None or int(ts) <= to_ms)


def class_stats(class_id: str, from_ms: Optional[int] = None, to_ms: Optional[int] = None) -> dict:
    """Per-module completion counts and test pairs for a class. With a period, only modules started
    or completed inside it, and pairs whose post-test was taken inside it, are counted."""
    data = classdata.load_class(class_id)
    active = {data.student_id(r) for r in data.active_roster}
    modules = []
    for a in data.assignments:
        module_id = a["moduleId"]
        states = {sid: i for sid, i in classdata.module_states(class_id, module_id).items()
                  if sid in active and _in_period(i.get("startedAt"), from_ms, to_ms)}
        assess = {sid: p for sid, p in classdata.class_assessments(class_id, module_id).items()
                  if sid in active and _in_period((p.get("post") or {}).get("submittedAt"), from_ms, to_ms)}
        pairs = [(p["pre"]["scorePct"], p["post"]["scorePct"]) for p in assess.values() if p.get("pre") and p.get("post")]
        modules.append({
            "moduleId": module_id, "title": data.modules[module_id].get("title"), "enrolled": len(active),
            "started": len(states),
            "complete": sum(1 for i in states.values() if i.get("state") == "complete" and _in_period(i.get("completedAt"), from_ms, to_ms)),
            "pairs": pairs, "concepts": gain.concept_pairs(assess),
        })
    return {"classId": class_id, "name": data.meta.get("name"), "orgId": data.meta.get("orgId"), "cohortId": data.meta.get("cohortId"),
            "enrolled": len(active), "modules": modules}


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


def _hide_small_concepts(rows: List[dict]) -> List[dict]:
    out = []
    for row in rows:
        row = gain.suppress(row)
        if row["postN"] < gain.MIN_GROUP_SIZE:
            row = {**row, "masteryPct": None}
        out.append(row)
    return out


def concept_gain(class_ids: List[str], suppress: bool = False) -> List[dict]:
    """Gain and mastery per concept pooled across the given classes and all their modules."""
    parts = [m["concepts"] for c in class_ids for m in class_stats(c)["modules"]]
    rows = gain.concept_rows(gain.merge_concept_pairs(parts))
    return _hide_small_concepts(rows) if suppress else rows


def module_gain_pooled(class_ids: List[str], module_id: str) -> dict:
    """Learning gain for one module pooled across classes. Always suppressed for small groups."""
    pairs, parts, enrolled, used = [], [], 0, 0
    for class_id in class_ids:
        data = classdata.load_class(class_id)
        if module_id not in data.modules:
            continue
        active = {data.student_id(r) for r in data.active_roster}
        assess = {sid: p for sid, p in classdata.class_assessments(class_id, module_id).items() if sid in active}
        used += 1
        enrolled += len(active)
        pairs += [(p["pre"]["scorePct"], p["post"]["scorePct"]) for p in assess.values() if p.get("pre") and p.get("post")]
        parts.append(gain.concept_pairs(assess))
    rows = gain.concept_rows(gain.merge_concept_pairs(parts))
    return {"moduleId": module_id, "classes": used, "learningGain": gain.suppress(gain.summarize(pairs, enrolled)),
            "byConcept": _hide_small_concepts(rows), "definitions": DEFINITIONS}


def scope_class_ids(class_id: Optional[str] = None, cohort_id: Optional[str] = None, org_id: Optional[str] = None) -> List[str]:
    """Class IDs matching the filters (all classes if none are given)."""
    if class_id:
        return [class_id]
    if cohort_id:
        return classdata.classes_in_cohort(cohort_id)
    metas = classdata.class_metas()
    if org_id:
        metas = [m for m in metas if m.get("orgId") == org_id]
    return sorted(m["pk"][len("CLS#"):] for m in metas)


def grouped_progress(class_ids: List[str], group_by: str, from_ms: Optional[int] = None, to_ms: Optional[int] = None) -> List[dict]:
    """Completion and gain grouped by cohort, class, module or org. Small groups are suppressed."""
    stats = [class_stats(c, from_ms, to_ms) for c in class_ids]
    if group_by == "class":
        return [{"key": s["classId"], "name": s["name"], **_rollup([s], True)} for s in stats]
    if group_by == "module":
        return _rollup(stats, True)["byModule"]
    groups: Dict[str, List[dict]] = {}
    field = "cohortId" if group_by == "cohort" else "orgId"
    for s in stats:
        groups.setdefault(s.get(field) or "none", []).append(s)
    return [{"key": key, "name": classdata.name_of(f"{'COH' if group_by == 'cohort' else 'ORG'}#{key}") if key != "none" else None,
             **_rollup(members, True)} for key, members in sorted(groups.items())]
