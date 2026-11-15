"""Hint struggle report and gradebook for one class.

Hint log items (events table, written by the student player when a hint is given):
  pk HINT#<classId>, sk <ts>#<studentId>: studentId, moduleId, activityId, questionId,
  concepts, level, question (what the student typed), hint (what they got), filtered
"""
from collections import Counter, defaultdict
from typing import Dict, List

from boto3.dynamodb.conditions import Key

from cic import classdata, db
from cic.classdata import ClassData
from cic.progress import flatten_activities
from reports_service import _views, student_row

RECENT = 50
SCORED = ("check", "code")  # steps with a score kept per student (bestScore)


def hint_log(class_id: str) -> List[dict]:
    items = db.query_all(db.get_table(db.EVENTS), KeyConditionExpression=Key("pk").eq(f"HINT#{class_id}"))
    return sorted(items, key=lambda i: i["sk"])


def _titles(data: ClassData):
    modules = {m: (doc.get("title") or m) for m, doc in data.modules.items()}
    acts = {(m, a["activityId"]): (a.get("title") or a.get("type")) for m, doc in data.modules.items() for a in flatten_activities(doc)}
    return modules, acts


def hints_report(data: ClassData) -> dict:
    """Where the class needed help: by concept, by step, by student, and the latest hints for review."""
    log = hint_log(data.class_id)
    names = {ClassData.student_id(r): student_row(r) for r in data.roster}
    module_titles, act_titles = _titles(data)

    by_concept: Dict[str, dict] = defaultdict(lambda: {"hints": 0, "students": set()})
    by_activity: Dict[tuple, dict] = defaultdict(lambda: {"hints": 0, "students": set()})
    by_student: Dict[str, dict] = defaultdict(lambda: {"hints": 0, "concepts": Counter()})
    for h in log:
        sid = h.get("studentId")
        concepts = list(h.get("concepts") or []) or ["(no concept tag)"]
        for c in concepts:
            by_concept[c]["hints"] += 1
            by_concept[c]["students"].add(sid)
            by_student[sid]["concepts"][c] += 1
        key = (h.get("moduleId"), h.get("activityId"))
        by_activity[key]["hints"] += 1
        by_activity[key]["students"].add(sid)
        by_student[sid]["hints"] += 1

    enrolled = len(data.active_roster)
    concepts = sorted(({"concept": c, "hints": v["hints"], "students": len(v["students"]),
                        "studentPct": round(len(v["students"]) / enrolled * 100) if enrolled else None}
                       for c, v in by_concept.items()), key=lambda r: (-r["students"], -r["hints"], r["concept"]))
    activities = sorted(({"moduleId": m, "moduleTitle": module_titles.get(m, m), "activityId": a,
                          "activityTitle": act_titles.get((m, a), a), "hints": v["hints"], "students": len(v["students"])}
                         for (m, a), v in by_activity.items()), key=lambda r: (-r["hints"], r["moduleTitle"] or ""))
    students = sorted(({**{k: names.get(sid, {}).get(k) for k in ("studentId", "displayName", "rosterNumber")},
                        "studentId": sid, "hints": v["hints"], "topConcepts": [c for c, _ in v["concepts"].most_common(3)]}
                       for sid, v in by_student.items()), key=lambda r: (-r["hints"], r.get("rosterNumber") or 0))
    recent = [{"at": int(h["sk"].split("#", 1)[0]), "studentId": h.get("studentId"),
               "displayName": names.get(h.get("studentId"), {}).get("displayName"),
               "moduleTitle": module_titles.get(h.get("moduleId"), h.get("moduleId")),
               "activityTitle": act_titles.get((h.get("moduleId"), h.get("activityId")), h.get("activityId")),
               "concepts": list(h.get("concepts") or []), "level": int(h.get("level", 1)),
               "question": h.get("question") or "", "hint": h.get("hint") or "", "filtered": bool(h.get("filtered"))}
              for h in reversed(log[-RECENT:])]
    tagged = [c for c in concepts if c["concept"] != "(no concept tag)"]
    # Code exercises have no concept tags, so fall back to the step students needed most help on.
    reteach = tagged[0]["concept"] if tagged else (
        f'{activities[0]["moduleTitle"]}: {activities[0]["activityTitle"]}' if activities else None)
    return {"totals": {"hints": len(log), "studentsWhoAsked": len(by_student), "enrolled": enrolled},
            "reteachFirst": reteach, "reteachFirstIsStep": not tagged and bool(activities),
            "concepts": concepts, "activities": activities, "students": students, "recent": recent}


def _mean(values):
    vals = [float(v) for v in values if v is not None]
    return round(sum(vals) / len(vals), 1) if vals else None


def gradebook(data: ClassData) -> dict:
    """One row per active student: per module completion, score, pre/post/gain and hints used,
    then overall completion, score, hints and the concept they asked for help on most."""
    hints = defaultdict(Counter)        # studentId -> {moduleId: n}
    hint_concepts = defaultdict(Counter)  # studentId -> {concept: n}
    for h in hint_log(data.class_id):
        hints[h.get("studentId")][h.get("moduleId")] += 1
        for c in h.get("concepts") or []:
            hint_concepts[h.get("studentId")][c] += 1
    assessments = {m: classdata.class_assessments(data.class_id, m) for m in data.order}
    scored = {m: [a["activityId"] for a in flatten_activities(data.modules[m]) if a.get("type") in SCORED] for m in data.order}
    modules = [{"moduleId": m, "title": data.modules[m].get("title") or m} for m in data.order]

    rows = []
    for r in data.active_roster:
        sid = ClassData.student_id(r)
        acts = classdata.student_activities(sid)
        views, _ = _views(data, r, acts)
        cells = {}
        for v in views:
            m = v["moduleId"]
            pair = assessments[m].get(sid, {})
            pre = float(pair["pre"]["scorePct"]) if "pre" in pair else None
            post = float(pair["post"]["scorePct"]) if "post" in pair else None
            cells[m] = {"state": v["state"], "percent": v["percent"],
                        "score": _mean(acts.get((m, a), {}).get("bestScore") for a in scored[m]),
                        "pre": pre, "post": post, "gain": round(post - pre, 1) if pre is not None and post is not None else None,
                        "hints": hints[sid][m]}
        top = hint_concepts[sid].most_common(1)
        if not top and hints[sid]:  # untagged hints (code exercises): name the module instead
            busiest = hints[sid].most_common(1)[0][0]
            top = [((data.modules.get(busiest) or {}).get("title") or busiest, 0)]
        rows.append({**student_row(r), "modules": cells, "overall": {
            "completion": _mean(c["percent"] for c in cells.values()),
            "score": _mean(c["score"] for c in cells.values()),
            "gain": _mean(c["gain"] for c in cells.values()),
            "hints": sum(c["hints"] for c in cells.values()),
            "mostHelpOn": top[0][0] if top else None}})
    rows.sort(key=lambda s: (s.get("rosterNumber") or 0, s.get("displayName") or ""))
    return {"modules": modules, "students": rows,
            "definitions": {"percent": "share of the module's required steps finished",
                            "score": "average best score on the module's check and code steps",
                            "gain": "post-test minus pretest, in percentage points",
                            "hints": "AI hints asked for in the module"}}


def gradebook_csv_rows(book: dict):
    header = ["rosterNumber", "student", "gradeLevel"]
    for m in book["modules"]:
        t = m["title"]
        header += [f"{t} complete %", f"{t} score", f"{t} pretest", f"{t} post-test", f"{t} gain", f"{t} hints"]
    header += ["overall complete %", "overall score", "overall gain", "total hints", "asked most help on"]
    rows = []
    for s in book["students"]:
        row = [s.get("rosterNumber"), s.get("displayName"), s.get("gradeLevel")]
        for m in book["modules"]:
            c = s["modules"].get(m["moduleId"], {})
            row += [c.get("percent"), c.get("score"), c.get("pre"), c.get("post"), c.get("gain"), c.get("hints")]
        o = s["overall"]
        row += [o["completion"], o["score"], o["gain"], o["hints"], o["mostHelpOn"]]
        rows.append(row)
    return header, rows
