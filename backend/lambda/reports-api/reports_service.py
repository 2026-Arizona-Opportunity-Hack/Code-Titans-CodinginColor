"""Report builders for instructors (progress matrix, attention lists, student detail)."""
from datetime import datetime, timedelta, timezone
from typing import Dict, List

from boto3.dynamodb.conditions import Key

from cic import classdata, db, keys
from cic.classdata import ClassData
from cic.errors import NotFound
from cic.ids import to_ms
from cic.progress import COMPLETE, compute_modules, flatten_activities

DAY_MS = 24 * 3600 * 1000
# Same names and defaults as the class API (PATCH /classes/{id} settings).
DEFAULT_SETTINGS = {"stuckFailedAttempts": 3, "stuckTimeMultiplier": 2, "notStartedDays": 1, "inactiveSchoolDays": 3}


def school_days_between(start_ms: int, end_ms: int) -> int:
    """Weekdays (Monday to Friday) that start on or after start_ms and end before end_ms."""
    if end_ms <= start_ms:
        return 0
    first = datetime.fromtimestamp(start_ms / 1000, tz=timezone.utc).date()
    last = datetime.fromtimestamp(end_ms / 1000, tz=timezone.utc).date()
    return sum(1 for i in range((last - first).days) if (first + timedelta(days=i)).weekday() < 5)


def settings(data: ClassData) -> dict:
    return {**DEFAULT_SETTINGS, **(data.meta.get("settings") or {})}


def student_row(roster_item: dict) -> dict:
    return {"studentId": ClassData.student_id(roster_item), "displayName": roster_item.get("displayName"),
            "rosterNumber": roster_item.get("rosterNumber"), "externalId": roster_item.get("externalId")}


def find_roster(data: ClassData, student_id: str) -> dict:
    for r in data.roster:
        if ClassData.student_id(r) == student_id:
            return r
    raise NotFound("Student not found in this class")


def _start(data: ClassData, roster_item: dict):
    return roster_item.get("startModuleId") or data.meta.get("currentModuleId")


def _views(data: ClassData, roster_item: dict, acts: dict):
    statuses = {k: v["status"] for k, v in acts.items() if v.get("status")}
    sid = ClassData.student_id(roster_item)
    return compute_modules(data.order, data.modules, statuses, _start(data, roster_item), data.overrides.get(sid, []))


def active_minutes(acts: dict, module_id: str) -> int:
    return round(sum(int(v.get("activeSeconds", 0)) for (m, _), v in acts.items() if m == module_id) / 60)


def progress_matrix(data: ClassData) -> dict:
    students = []
    for r in data.active_roster:
        acts = classdata.student_activities(ClassData.student_id(r))
        views, resume = _views(data, r, acts)
        students.append({**student_row(r), "resume": resume, "modules": {
            v["moduleId"]: {"state": v["state"], "percent": v["percent"], "activeMinutes": active_minutes(acts, v["moduleId"])} for v in views}})
    modules = [{"moduleId": a["moduleId"], "title": data.modules[a["moduleId"]].get("title"), "moduleVersion": int(a["moduleVersion"])}
               for a in data.assignments]
    return {"modules": modules, "students": students}


def attention(data: ClassData, now_ms: int) -> dict:
    cfg = settings(data)
    assigned_at = {a["moduleId"]: to_ms(a.get("assignedAt")) for a in data.assignments}
    not_started: List[dict] = []
    stuck: List[dict] = []
    for r in data.active_roster:
        acts = classdata.student_activities(ClassData.student_id(r))
        _, resume = _views(data, r, acts)
        if not resume:
            continue
        module_id, activity_id = resume["moduleId"], resume["activityId"]
        module_acts = {k: v for k, v in acts.items() if k[0] == module_id}
        row = {**student_row(r), "moduleId": module_id, "activityId": activity_id}
        if not module_acts:
            since = max(to_ms(r.get("createdAt")), assigned_at.get(module_id, 0))  # when this student could first start it
            if now_ms - since >= cfg["notStartedDays"] * DAY_MS:
                not_started.append({**row, "waitingDays": (now_ms - since) // DAY_MS if since else None})
            continue
        reasons = []
        current = acts.get((module_id, activity_id)) or {}
        if int(current.get("attempts", 0)) >= cfg["stuckFailedAttempts"] and current.get("status") != COMPLETE:
            reasons.append("repeated_attempts")
        if int(current.get("hintCount", 0)) >= cfg["stuckFailedAttempts"] and current.get("status") != COMPLETE:
            reasons.append("asked_for_hints")
        estimate = next((a.get("estimatedMinutes") for a in flatten_activities(data.modules[module_id]) if a["activityId"] == activity_id), None)
        if estimate and int(current.get("activeSeconds", 0)) > cfg["stuckTimeMultiplier"] * float(estimate) * 60:
            reasons.append("taking_longer_than_expected")
        last_active = max(int(v.get("lastActiveAt", 0)) for v in module_acts.values())
        if school_days_between(last_active, now_ms) >= cfg["inactiveSchoolDays"]:
            reasons.append("inactive")
        if reasons:
            stuck.append({**row, "reasons": reasons})
    return {"notStarted": not_started, "stuck": stuck}


def student_detail(data: ClassData, roster_item: dict) -> dict:
    sid = ClassData.student_id(roster_item)
    items = list(db.query_all(db.get_table(db.PROGRESS), KeyConditionExpression=Key("pk").eq(keys.stu_pk(sid))))
    acts = {}
    for i in items:
        if i["sk"].startswith("ACT#"):
            _, m, a = i["sk"].split("#", 2)
            acts[(m, a)] = i
    views, resume = _views(data, roster_item, acts)
    assessments: Dict[str, dict] = {}
    for i in items:
        if i["sk"].startswith("ASM#"):
            assessments.setdefault(i["moduleId"], {})[i["role"]] = float(i["scorePct"])
    modules = []
    for v in views:
        mid = v["moduleId"]
        detail = []
        for act, state in zip(flatten_activities(data.modules[mid]), v["activities"]):
            rec = acts.get((mid, act["activityId"])) or {}
            detail.append({"activityId": act["activityId"], "type": act.get("type"), "state": state["state"],
                           "attempts": int(rec.get("attempts", 0)), "bestScore": rec.get("bestScore"),
                           "activeMinutes": round(int(rec.get("activeSeconds", 0)) / 60, 1), "completedAt": rec.get("completedAt")})
        modules.append({"moduleId": mid, "title": v["title"], "state": v["state"], "percent": v["percent"],
                        "pre": assessments.get(mid, {}).get("pre"), "post": assessments.get(mid, {}).get("post"), "activities": detail})
    submissions = [{"activityId": i["activityId"], "moduleId": i["moduleId"], "submittedAt": i["submittedAt"], "reviewStatus": i.get("reviewStatus"),
                    "autoScorePct": i.get("autoScorePct"), "reviewScore": i.get("reviewScore"), "reviewComment": i.get("reviewComment")}
                   for i in items if i["sk"].startswith("SUB#")]
    return {"student": student_row(roster_item), "status": roster_item.get("status", "active"), "resume": resume, "modules": modules, "submissions": submissions}
