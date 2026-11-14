"""Loaders for class-level data used by reports and the read API (no authorization here;
callers must authorize first)."""
from dataclasses import dataclass, field
from typing import Dict, List, Tuple

from boto3.dynamodb.conditions import Key

from . import db, keys
from .errors import ApiError, NotFound

_MODULE_CACHE: Dict[Tuple[str, int], dict] = {}  # published versions are immutable, so caching is safe


def get_module_doc(module_id: str, version: int) -> dict:
    cache_key = (module_id, version)
    if cache_key not in _MODULE_CACHE:
        item = db.get_table(db.CONTENT).get_item(Key={"pk": keys.module_pk(module_id), "sk": keys.version_sk(version)}).get("Item")
        if not item or "module" not in item:
            raise ApiError("Module content is unavailable", code="CONTENT_MISSING")
        _MODULE_CACHE[cache_key] = item["module"]
    return _MODULE_CACHE[cache_key]


@dataclass
class ClassData:
    class_id: str
    meta: dict
    roster: List[dict]
    assignments: List[dict]
    modules: Dict[str, dict]
    overrides: Dict[str, List[str]] = field(default_factory=dict)

    @property
    def order(self) -> List[str]:
        return [a["moduleId"] for a in self.assignments]

    @property
    def active_roster(self) -> List[dict]:
        return [r for r in self.roster if r.get("status", "active") == "active"]

    @staticmethod
    def student_id(roster_item: dict) -> str:
        return roster_item["sk"][len(keys.ROSTER_PREFIX):]


def load_class(class_id: str) -> ClassData:
    core = db.get_table(db.CORE)
    pk = keys.cls_pk(class_id)
    meta = core.get_item(Key={"pk": pk, "sk": "META"}).get("Item")
    if not meta:
        raise NotFound("Class not found")
    roster = list(db.query_all(core, KeyConditionExpression=Key("pk").eq(pk) & Key("sk").begins_with(keys.ROSTER_PREFIX)))
    roster.sort(key=lambda r: (int(r.get("rosterNumber", 0)), r.get("displayName", "")))
    assignments = list(db.query_all(core, KeyConditionExpression=Key("pk").eq(pk) & Key("sk").begins_with(keys.ASSIGNMENT_PREFIX)))
    assignments.sort(key=lambda a: a["sk"])
    modules = {a["moduleId"]: get_module_doc(a["moduleId"], int(a["moduleVersion"])) for a in assignments}
    overrides: Dict[str, List[str]] = {}
    for item in db.query_all(core, KeyConditionExpression=Key("pk").eq(pk) & Key("sk").begins_with("OVR#")):
        overrides.setdefault(item["studentId"], []).append(item["moduleId"])
    return ClassData(class_id, meta, roster, assignments, modules, overrides)


def student_activities(student_id: str) -> Dict[Tuple[str, str], dict]:
    table = db.get_table(db.PROGRESS)
    out = {}
    for item in db.query_all(table, KeyConditionExpression=Key("pk").eq(keys.stu_pk(student_id)) & Key("sk").begins_with("ACT#")):
        _, module_id, activity_id = item["sk"].split("#", 2)
        out[(module_id, activity_id)] = item
    return out


def module_states(class_id: str, module_id: str) -> Dict[str, dict]:
    """{studentId: module state item} for one module in one class."""
    table = db.get_table(db.PROGRESS)
    items = db.query_all(table, IndexName="gsi1", KeyConditionExpression=Key("gsi1pk").eq(keys.gsi_class_module(class_id, module_id)))
    return {i["pk"][len("STU#"):]: i for i in items}


def class_assessments(class_id: str, module_id: str) -> Dict[str, dict]:
    """{studentId: {"pre": item, "post": item}} for one module in one class."""
    table = db.get_table(db.PROGRESS)
    out: Dict[str, dict] = {}
    for i in db.query_all(table, IndexName="gsi1", KeyConditionExpression=Key("gsi1pk").eq(keys.gsi_class_assessments(class_id, module_id))):
        out.setdefault(i["pk"][len("STU#"):], {})[i["role"]] = i
    return out


def classes_in_cohort(cohort_id: str) -> List[str]:
    core = db.get_table(db.CORE)
    items = db.query_all(core, IndexName="gsi2", KeyConditionExpression=Key("gsi2pk").eq(keys.coh_pk(cohort_id)))
    return sorted(i["pk"][len("CLS#"):] for i in items if i["sk"] == "META")


def _scan_core(filter_expression, values, names=None):
    """Scan the core table with a filter. The table is small (hundreds of items), so a scan is cheap."""
    table = db.get_table(db.CORE)
    kwargs = {"FilterExpression": filter_expression, "ExpressionAttributeValues": values}
    if names:
        kwargs["ExpressionAttributeNames"] = names
    while True:
        resp = table.scan(**kwargs)
        yield from resp.get("Items", [])
        if not resp.get("LastEvaluatedKey"):
            return
        kwargs["ExclusiveStartKey"] = resp["LastEvaluatedKey"]


def class_metas() -> List[dict]:
    """META items for every class."""
    return list(_scan_core("begins_with(pk, :c) AND sk = :m", {":c": "CLS#", ":m": "META"}))


def cohort_metas() -> List[dict]:
    return list(_scan_core("begins_with(pk, :c) AND sk = :m", {":c": "COH#", ":m": "META"}))


def name_of(pk: str) -> str:
    item = db.get_table(db.CORE).get_item(Key={"pk": pk, "sk": "META"}).get("Item") or {}
    return item.get("name")
