"""Assign modules to a class, and unlock a module for one student.

An assignment pins the module version that was latest when it was assigned, so
publishing a newer version never changes a class that is already running.
"""
import re

from boto3.dynamodb.conditions import Key

from cic import db, validate
from cic.authz import require_class_access, require_staff
from cic.errors import Conflict, Forbidden, NotFound, ValidationError
from cic.http import Reply, Request
from cic.ids import utc_now_iso
from roster import class_id_from, student_id_from

MAX_ORDER = 9999
_UNSET = object()


def assignment_sk(order: int, module_id: str) -> str:
    return f"ASG#{order:04d}#{module_id}"


def load_assignments(table, class_id: str) -> list:
    items = db.query_all(table, KeyConditionExpression=(
        Key("pk").eq(f"CLS#{class_id}") & Key("sk").begins_with("ASG#")))
    return sorted(items, key=lambda i: (int(i["order"]), i["moduleId"]))


def public(item: dict, started=None) -> dict:
    out = {"moduleId": item["moduleId"], "moduleVersion": int(item["moduleVersion"]),
           "order": int(item["order"]), "targetDate": item.get("targetDate")}
    if started is not None:
        out["startedCount"] = started
    return out


def started_count(class_id: str, module_id: str) -> int:
    """Students with progress on this module in this class (the progress table's class index)."""
    return db.get_table(db.PROGRESS).query(
        IndexName="gsi1", Select="COUNT",
        KeyConditionExpression=Key("gsi1pk").eq(f"CLS#{class_id}#MOD#{module_id}"))["Count"]


def latest_version(module_id: str) -> int:
    meta = db.get_table(db.CONTENT).get_item(Key={"pk": f"MOD#{module_id}", "sk": "META"}).get("Item")
    version = int(meta.get("latestVersion", 0)) if meta else 0
    if version < 1:
        raise ValidationError("moduleId does not match a published module")
    return version


def _module_id(req: Request) -> str:
    try:
        return validate.safe_id(req.path.get("moduleId", ""), "moduleId")
    except ValidationError:
        raise NotFound("Assignment not found")


def _find(table, class_id: str, module_id: str) -> dict:
    found = next((a for a in load_assignments(table, class_id) if a["moduleId"] == module_id), None)
    if not found:
        raise NotFound("Assignment not found")
    return found


def assign(req: Request):
    class_id = class_id_from(req)
    table = db.get_table(db.CORE)
    require_class_access(req.auth, table, class_id)
    body = req.json()
    validate.reject_unknown(body, ("moduleId", "order", "targetDate"))
    module_id = validate.safe_id(body.get("moduleId"), "moduleId")
    target = validate.date_text(body, "targetDate")
    existing = load_assignments(table, class_id)
    if any(a["moduleId"] == module_id for a in existing):
        raise Conflict("This module is already assigned to the class")
    version = latest_version(module_id)
    order = body.get("order")
    order = validate.integer(order, "order", 1, MAX_ORDER) if order is not None else (
        max((int(a["order"]) for a in existing), default=0) + 1)
    item = {"pk": f"CLS#{class_id}", "sk": assignment_sk(order, module_id), "moduleId": module_id,
            "moduleVersion": version, "order": order, "assignedAt": utc_now_iso()}
    if target:
        item["targetDate"] = target
    table.put_item(Item=item)
    return Reply(data=public(item, 0), status=201)


def list_assignments(req: Request):
    class_id = class_id_from(req)
    table = db.get_table(db.CORE)
    require_class_access(req.auth, table, class_id)
    return [public(a, started_count(class_id, a["moduleId"])) for a in load_assignments(table, class_id)]


def update_assignment(req: Request):
    class_id, module_id = class_id_from(req), _module_id(req)
    table = db.get_table(db.CORE)
    staff = require_staff(req.auth)
    require_class_access(req.auth, table, class_id)
    body = req.json()
    validate.reject_unknown(body, ("order", "targetDate", "moduleVersion"))
    current = _find(table, class_id, module_id)
    item = dict(current)
    if "order" in body:
        item["order"] = validate.integer(body["order"], "order", 1, MAX_ORDER)
    if "targetDate" in body:
        if body["targetDate"] is None:
            item.pop("targetDate", None)
        else:
            item["targetDate"] = validate.date_text(body, "targetDate")
    if "moduleVersion" in body:
        version = validate.integer(body["moduleVersion"], "moduleVersion", 1, 10_000)
        if version <= int(current["moduleVersion"]) or version > latest_version(module_id):
            raise ValidationError("moduleVersion must be newer than the current one and already published")
        if started_count(class_id, module_id) and not staff.is_admin:
            raise Forbidden("Students have started this module. Ask an administrator to change its version")
        item["moduleVersion"] = version
    if item == current:
        raise ValidationError("Nothing to update")
    item["sk"] = assignment_sk(int(item["order"]), module_id)
    ops = [{"Put": {"TableName": table.name, "Item": item}}]
    if item["sk"] != current["sk"]:
        ops.insert(0, {"Delete": {"TableName": table.name, "Key": {"pk": current["pk"], "sk": current["sk"]}}})
    table.meta.client.transact_write_items(TransactItems=ops)
    return public(item)


def unassign(req: Request):
    class_id, module_id = class_id_from(req), _module_id(req)
    table = db.get_table(db.CORE)
    require_class_access(req.auth, table, class_id)
    current = _find(table, class_id, module_id)
    table.delete_item(Key={"pk": current["pk"], "sk": current["sk"]})
    return Reply(data={"unassigned": True})


def unlock(req: Request):
    class_id, student_id = class_id_from(req), student_id_from(req)
    table = db.get_table(db.CORE)
    staff = require_staff(req.auth)
    require_class_access(req.auth, table, class_id)
    body = req.json()
    validate.reject_unknown(body, ("moduleId",))
    module_id = validate.safe_id(body.get("moduleId"), "moduleId")
    if not table.get_item(Key={"pk": f"CLS#{class_id}", "sk": f"STU#{student_id}"}).get("Item"):
        raise NotFound("Student not found")
    _find(table, class_id, module_id)  # the module must be assigned to this class
    table.put_item(Item={"pk": f"CLS#{class_id}", "sk": f"OVR#{student_id}#{module_id}",
                         "unlockedBy": staff.user_id, "unlockedAt": utc_now_iso()})
    return {"studentId": student_id, "moduleId": module_id, "unlocked": True}


ROUTES = {
    "POST /v1/classes/{classId}/assignments": assign,
    "GET /v1/classes/{classId}/assignments": list_assignments,
    "PATCH /v1/classes/{classId}/assignments/{moduleId}": update_assignment,
    "DELETE /v1/classes/{classId}/assignments/{moduleId}": unassign,
    "POST /v1/classes/{classId}/students/{studentId}/unlock": unlock,
}
