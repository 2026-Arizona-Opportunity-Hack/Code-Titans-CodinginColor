"""Roster: one student at a time. A student is identified by a UUID, never by name."""
import re

from boto3.dynamodb.conditions import Key

from cic import credentials, db, validate
from cic.authz import require_admin, require_class_access, require_staff
from cic.errors import Conflict, Forbidden, NotFound, ValidationError
from cic.http import Reply, Request
from cic.ids import new_id, utc_now_iso

STATUSES = ("active", "inactive")
MAX_ROSTER = 500


def normalize_name(name: str) -> str:
    return re.sub(r"\s+", " ", name).strip().casefold()


def public(item: dict, class_id: str) -> dict:
    """Never include credHmac."""
    return {
        "studentId": item["sk"].split("#", 1)[1], "classId": class_id,
        "displayName": item["displayName"], "rosterNumber": int(item["rosterNumber"]),
        "externalId": item.get("externalId"), "status": item["status"],
        "startModuleId": item.get("startModuleId"), "hasCredential": bool(item.get("credHmac")),
    }


def load_roster(table, class_id: str) -> list:
    items = db.query_all(table, KeyConditionExpression=(
        Key("pk").eq(f"CLS#{class_id}") & Key("sk").begins_with("STU#")))
    return sorted(items, key=lambda i: int(i["rosterNumber"]))


def class_id_from(req: Request) -> str:
    try:
        return validate.safe_id(req.path.get("classId", ""), "classId")
    except ValidationError:
        raise NotFound("Class not found")


def student_id_from(req: Request) -> str:
    try:
        return validate.safe_id(req.path.get("studentId", ""), "studentId")
    except ValidationError:
        raise NotFound("Student not found")


def resolve_start_module(table, class_id: str, requested):
    """The module a new student starts at: the request, else the class's current module."""
    if requested is not None:
        validate.safe_id(requested, "startModuleId")
        if not db.get_table(db.CONTENT).get_item(Key={"pk": f"MOD#{requested}", "sk": "META"}).get("Item"):
            raise ValidationError("startModuleId does not match a module")
        return requested
    meta = table.get_item(Key={"pk": f"CLS#{class_id}", "sk": "META"}).get("Item", {})
    return meta.get("currentModuleId")


def allocate_roster_numbers(table, class_id: str, count: int) -> int:
    """Reserve `count` numbers that are never reused. Returns the first one."""
    result = table.update_item(
        Key={"pk": f"CLS#{class_id}", "sk": "META"}, UpdateExpression="ADD nextRosterNumber :n",
        ExpressionAttributeValues={":n": count}, ReturnValues="UPDATED_NEW")
    return int(result["Attributes"]["nextRosterNumber"]) - count + 1


def list_roster(req: Request):
    class_id = class_id_from(req)
    table = db.get_table(db.CORE)
    require_class_access(req.auth, table, class_id)
    status = validate.choice(req.query, "status", STATUSES)
    q = normalize_name(req.query.get("q", ""))
    rows = [public(i, class_id) for i in load_roster(table, class_id)
            if (not status or i["status"] == status) and (not q or q in normalize_name(i["displayName"]))]
    return Reply(data=rows, meta={"nextCursor": None})


def list_duplicates(req: Request):
    class_id = class_id_from(req)
    table = db.get_table(db.CORE)
    require_class_access(req.auth, table, class_id)
    groups = {}
    for item in load_roster(table, class_id):
        if item["status"] == "active":
            groups.setdefault(normalize_name(item["displayName"]), []).append(item)
    return [{"displayName": g[0]["displayName"],
             "students": [{"studentId": s["sk"].split("#", 1)[1], "rosterNumber": int(s["rosterNumber"])} for s in g]}
            for g in groups.values() if len(g) > 1]


def add_student(req: Request):
    class_id = class_id_from(req)
    table = db.get_table(db.CORE)
    require_class_access(req.auth, table, class_id)
    body = req.json()
    validate.reject_unknown(body, ("displayName", "externalId", "startModuleId"))
    name = validate.text(body, "displayName")
    external_id = validate.text(body, "externalId", 64, required=False)
    start_module = resolve_start_module(table, class_id, body.get("startModuleId"))

    roster = load_roster(table, class_id)
    if len(roster) >= MAX_ROSTER:
        raise ValidationError(f"A class can hold at most {MAX_ROSTER} students")
    if external_id and any(i.get("externalId") == external_id for i in roster):
        raise Conflict("A student with this externalId is already in the class")
    duplicate = next((i for i in roster if i["status"] == "active"
                      and normalize_name(i["displayName"]) == normalize_name(name)), None)

    words, digest = credentials.issue(class_id, (i.get("credHmac", "") for i in roster))
    student_id = new_id()
    number = allocate_roster_numbers(table, class_id, 1)
    item = {"pk": f"CLS#{class_id}", "sk": f"STU#{student_id}", "displayName": name,
            "rosterNumber": number, "status": "active", "credHmac": digest, "credVersion": 1,
            "createdAt": utc_now_iso()}
    for field, value in (("externalId", external_id), ("startModuleId", start_module)):
        if value:
            item[field] = value
    table.meta.client.transact_write_items(TransactItems=[
        {"Put": {"TableName": table.name, "Item": item}},
        {"Put": {"TableName": table.name, "Item": {"pk": f"STU#{student_id}", "sk": "META", "classId": class_id}}},
    ])
    out = dict(public(item, class_id), studentCode=words)  # shown once; only the HMAC is stored
    if duplicate:
        out["possibleDuplicateOf"] = duplicate["sk"].split("#", 1)[1]
    return Reply(data=out, status=201)


def update_student(req: Request):
    class_id, student_id = class_id_from(req), student_id_from(req)
    table = db.get_table(db.CORE)
    require_class_access(req.auth, table, class_id)
    body = req.json()
    validate.reject_unknown(body, ("displayName", "status"))
    changes = {"displayName": validate.text(body, "displayName", required=False),
               "status": validate.choice(body, "status", STATUSES)}
    changes = {k: v for k, v in changes.items() if v is not None}
    if not changes:
        raise ValidationError("Nothing to update")
    key = {"pk": f"CLS#{class_id}", "sk": f"STU#{student_id}"}
    if not table.get_item(Key=key).get("Item"):
        raise NotFound("Student not found")
    result = table.update_item(
        Key=key, ReturnValues="ALL_NEW", ConditionExpression="attribute_exists(pk)",
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in changes),
        ExpressionAttributeNames={f"#{k}": k for k in changes},
        ExpressionAttributeValues={f":{k}": v for k, v in changes.items()})
    return public(result["Attributes"], class_id)


def delete_student(req: Request):
    require_admin(req.auth)
    class_id, student_id = class_id_from(req), student_id_from(req)
    table = db.get_table(db.CORE)
    require_class_access(req.auth, table, class_id)
    key = {"pk": f"CLS#{class_id}", "sk": f"STU#{student_id}"}
    if not table.get_item(Key=key).get("Item"):
        raise NotFound("Student not found")
    table.meta.client.transact_write_items(TransactItems=[
        {"Delete": {"TableName": table.name, "Key": key}},
        {"Delete": {"TableName": table.name, "Key": {"pk": f"STU#{student_id}", "sk": "META"}}},
    ])
    progress = db.get_table(db.PROGRESS)
    with progress.batch_writer() as batch:
        for item in db.query_all(progress, KeyConditionExpression=Key("pk").eq(f"STU#{student_id}"),
                                 ProjectionExpression="pk, sk"):
            batch.delete_item(Key={"pk": item["pk"], "sk": item["sk"]})
    return Reply(data={"deleted": True})


def get_student(req: Request):
    staff = require_staff(req.auth)
    student_id = student_id_from(req)
    table = db.get_table(db.CORE)
    meta = table.get_item(Key={"pk": f"STU#{student_id}", "sk": "META"}).get("Item")
    if not meta:  # same answer for "missing" and "not yours", so IDs cannot be probed
        if staff.is_admin:
            raise NotFound("Student not found")
        raise Forbidden("You do not have access to this student")
    class_id = meta["classId"]
    require_class_access(req.auth, table, class_id)
    item = table.get_item(Key={"pk": f"CLS#{class_id}", "sk": f"STU#{student_id}"}).get("Item")
    if not item:
        raise NotFound("Student not found")
    return public(item, class_id)


ROUTES = {
    "GET /v1/classes/{classId}/roster": list_roster,
    "POST /v1/classes/{classId}/roster": add_student,
    "GET /v1/classes/{classId}/roster/duplicates": list_duplicates,
    "PATCH /v1/classes/{classId}/roster/{studentId}": update_student,
    "DELETE /v1/classes/{classId}/roster/{studentId}": delete_student,
    "GET /v1/students/{studentId}": get_student,
}
