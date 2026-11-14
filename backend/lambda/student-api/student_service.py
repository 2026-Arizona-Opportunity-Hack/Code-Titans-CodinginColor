"""Data loading and write helpers for the student player."""
import copy
from dataclasses import dataclass, field
from typing import Dict, List, Optional, Tuple

from boto3.dynamodb.conditions import Key

from cic import db, keys
from cic.authz import Student
from cic.errors import ApiError, Forbidden, NotFound
from cic.ids import now_ms
from cic.progress import compute_modules, flatten_activities

_MODULE_CACHE: Dict[Tuple[str, int], dict] = {}  # published versions are immutable, so caching is safe

STRIP_KEYS = ("answerKey", "explanation", "correct")


@dataclass
class Ctx:
    student: Student
    roster: dict
    class_meta: dict
    assignments: List[dict]
    modules: Dict[str, dict]
    act_items: Dict[Tuple[str, str], dict]
    overrides: List[str]
    order: List[str] = field(default_factory=list)

    @property
    def statuses(self) -> dict:
        return {k: v["status"] for k, v in self.act_items.items() if v.get("status")}

    @property
    def start_module_id(self) -> Optional[str]:
        return self.roster.get("startModuleId") or self.class_meta.get("currentModuleId")

    def views(self, statuses: Optional[dict] = None):
        return compute_modules(self.order, self.modules, statuses or self.statuses, self.start_module_id, self.overrides)

    def module(self, module_id: str) -> dict:
        if module_id not in self.modules:
            raise NotFound("Module not found")
        return self.modules[module_id]


def get_module_doc(module_id: str, version: int) -> dict:
    cache_key = (module_id, version)
    if cache_key not in _MODULE_CACHE:
        item = db.get_table(db.CONTENT).get_item(Key={"pk": keys.module_pk(module_id), "sk": keys.version_sk(version)}).get("Item")
        if not item or "module" not in item:
            raise ApiError("Module content is unavailable", code="CONTENT_MISSING")
        _MODULE_CACHE[cache_key] = item["module"]
    return _MODULE_CACHE[cache_key]


def load_ctx(student: Student) -> Ctx:
    core, progress = db.get_table(db.CORE), db.get_table(db.PROGRESS)
    cls = keys.cls_pk(student.class_id)
    roster = core.get_item(Key={"pk": cls, "sk": keys.roster_sk(student.student_id)}).get("Item")
    if not roster or roster.get("status", "active") != "active":
        raise Forbidden("Your account is not active in this class")
    class_meta = core.get_item(Key={"pk": cls, "sk": "META"}).get("Item") or {}
    assignments = list(db.query_all(core, KeyConditionExpression=Key("pk").eq(cls) & Key("sk").begins_with(keys.ASSIGNMENT_PREFIX)))
    assignments.sort(key=lambda a: a["sk"])
    modules = {a["moduleId"]: get_module_doc(a["moduleId"], int(a["moduleVersion"])) for a in assignments}
    act_items = {}
    for item in db.query_all(progress, KeyConditionExpression=Key("pk").eq(keys.stu_pk(student.student_id)) & Key("sk").begins_with("ACT#")):
        _, module_id, activity_id = item["sk"].split("#", 2)
        act_items[(module_id, activity_id)] = item
    ovr_prefix = f"OVR#{student.student_id}#"
    overrides = [i["moduleId"] for i in db.query_all(core, KeyConditionExpression=Key("pk").eq(cls) & Key("sk").begins_with(ovr_prefix))]
    return Ctx(student, roster, class_meta, assignments, modules, act_items, overrides, [a["moduleId"] for a in assignments])


def find_activity(module: dict, activity_id: str) -> dict:
    for act in flatten_activities(module):
        if act["activityId"] == activity_id:
            return act
    raise NotFound("Activity not found")


def assert_open(ctx: Ctx, module_id: str, activity_id: str) -> None:
    views, _ = ctx.views()
    view = next(v for v in views if v["moduleId"] == module_id)
    if view["state"] == "locked":
        raise Forbidden("Finish the previous module first", code="MODULE_LOCKED")
    state = next(a["state"] for a in view["activities"] if a["activityId"] == activity_id)
    if state == "locked":
        raise Forbidden("Finish the earlier activities first", code="ACTIVITY_LOCKED")


def sanitize_module(module: dict, act_states: List[dict], act_items: dict, version: int) -> dict:
    """Student-safe copy: no answer keys or explanations. Adds per-activity state and worksheet drafts."""
    doc = copy.deepcopy(module)
    state_by_id = {s["activityId"]: s["state"] for s in act_states}
    for lesson in doc.get("lessons", []):
        for act in lesson.get("activities", []):
            for item in act.get("questions", []) + act.get("fields", []):
                for k in STRIP_KEYS:
                    item.pop(k, None)
            act["state"] = state_by_id.get(act["activityId"], "locked")
            saved = act_items.get((doc["moduleId"], act["activityId"])) or {}
            if act.get("type") == "worksheet" and saved.get("draft"):
                act["draft"] = saved["draft"]
    doc["moduleVersion"] = version
    return doc


def save_activity(ctx: Ctx, module_id: str, activity_id: str, status: str, csid: Optional[str], result: Optional[dict],
                  score: Optional[float] = None) -> None:
    """Record an attempt on an activity. A completed activity never goes back to in_progress."""
    prior = ctx.act_items.get((module_id, activity_id)) or {}
    if prior.get("status") == "complete":
        status = "complete"
    best = max(float(prior.get("bestScore", 0)), score) if score is not None else None
    now = now_ms()
    names = {"#st": "status"}
    sets = ["#st = :st", "classId = :cls", "lastActiveAt = :now", "attempts = if_not_exists(attempts, :zero) + :one",
            "startedAt = if_not_exists(startedAt, :now)"]
    values = {":st": status, ":cls": ctx.student.class_id, ":now": now, ":zero": 0, ":one": 1}
    if csid:
        sets += ["lastClientSubmissionId = :csid", "lastResult = :res"]
        values.update({":csid": csid, ":res": db.to_dynamo(result)})
    if best is not None:
        sets.append("bestScore = :best")
        values[":best"] = db.to_dynamo(best)
    if status == "complete":
        sets.append("completedAt = if_not_exists(completedAt, :now)")
    db.get_table(db.PROGRESS).update_item(
        Key={"pk": keys.stu_pk(ctx.student.student_id), "sk": keys.activity_sk(module_id, activity_id)},
        UpdateExpression="SET " + ", ".join(sets),
        ExpressionAttributeNames=names,
        ExpressionAttributeValues=values,
    )
    ctx.act_items[(module_id, activity_id)] = {**prior, "status": status}


def sync_module_state(ctx: Ctx, module_id: str, complete: bool) -> None:
    now = now_ms()
    sets = ["#st = :st", "classId = :cls", "cohortId = :coh", "moduleVersion = :ver", "gsi1pk = :g1", "gsi1sk = :g2",
            "startedAt = if_not_exists(startedAt, :now)", "lastActiveAt = :now"]
    values = {
        ":st": "complete" if complete else "in_progress", ":cls": ctx.student.class_id, ":coh": ctx.class_meta.get("cohortId", "none"),
        ":ver": next(int(a["moduleVersion"]) for a in ctx.assignments if a["moduleId"] == module_id),
        ":g1": keys.gsi_class_module(ctx.student.class_id, module_id), ":g2": keys.stu_pk(ctx.student.student_id), ":now": now,
    }
    if complete:
        sets.append("completedAt = if_not_exists(completedAt, :now)")
    db.get_table(db.PROGRESS).update_item(
        Key={"pk": keys.stu_pk(ctx.student.student_id), "sk": keys.module_state_sk(module_id)},
        UpdateExpression="SET " + ", ".join(sets),
        ExpressionAttributeNames={"#st": "state"},
        ExpressionAttributeValues=values,
    )
