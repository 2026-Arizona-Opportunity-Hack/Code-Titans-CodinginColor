"""Create, list, read and update classes, and add instructors to a class."""
import os
import secrets
import uuid

import boto3
from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

from assignments import load_assignments, public as public_assignment
from cic import db, paging, validate
from cic.authz import INSTRUCTOR, require_admin, require_class_access, require_staff
from cic.errors import Conflict, Forbidden, NotFound, ValidationError
from cic.http import Reply, Request
from cic.ids import utc_now_iso

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I, easy to read aloud
STATUSES = ("active", "archived")
DEFAULT_SETTINGS = {"stuckFailedAttempts": 3, "stuckTimeMultiplier": 2, "notStartedDays": 1, "inactiveSchoolDays": 3}
SETTING_LIMITS = {"stuckFailedAttempts": (1, 20), "stuckTimeMultiplier": (1, 10),
                  "notStartedDays": (1, 14), "inactiveSchoolDays": (1, 14)}
_cognito = None


def cognito():
    global _cognito
    if _cognito is None:
        _cognito = boto3.client("cognito-idp")
    return _cognito


def instructors_of(table, class_id: str, names: dict) -> list:
    """[{userId, name}] for a class. Names come from the membership item, or from Cognito
    for memberships made before names were stored. `names` caches lookups per request."""
    out = []
    for m in db.query_all(table, KeyConditionExpression=Key("pk").eq(f"CLS#{class_id}") & Key("sk").begins_with("INS#")):
        user_id = m["sk"].split("#", 1)[1]
        if m.get("name"):
            names.setdefault(user_id, m["name"])
        if user_id not in names:
            names[user_id] = _cognito_name(user_id)
        out.append({"userId": user_id, "name": names[user_id]})
    return sorted(out, key=lambda i: i["name"].lower())


def _cognito_name(user_id: str) -> str:
    try:
        user = cognito().admin_get_user(UserPoolId=os.environ["USER_POOL_ID"], Username=user_id)
    except ClientError as err:
        if err.response["Error"]["Code"] == "UserNotFoundException":
            return "Former instructor"  # the account was deleted
        return "Instructor"  # a name is nice to have; never fail the class list over it
    attrs = {a["Name"]: a["Value"] for a in user.get("UserAttributes", [])}
    return attrs.get("name") or attrs.get("email") or "Instructor"


def with_instructors(table, meta: dict, names: dict) -> dict:
    return dict(public(meta), instructors=instructors_of(table, meta["pk"].split("#", 1)[1], names))


def new_join_code() -> str:
    return "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))


def public(meta: dict) -> dict:
    return {
        "classId": meta["pk"].split("#", 1)[1], "name": meta["name"], "orgId": meta["orgId"],
        "cohortId": meta.get("cohortId"), "ownerKind": meta.get("ownerKind", "cic"), "status": meta["status"], "joinCode": meta["joinCode"],
        "termStart": meta.get("termStart"), "termEnd": meta.get("termEnd"),
        "currentModuleId": meta.get("currentModuleId"),
        "settings": {**DEFAULT_SETTINGS, **(meta.get("settings") or {})},
        "createdAt": meta["createdAt"],
    }


def _exists(table, pk: str) -> bool:
    return bool(table.get_item(Key={"pk": pk, "sk": "META"}).get("Item"))


def _staff_name(req: Request) -> str:
    claims = ((req.auth or {}).get("jwt") or {}).get("claims") or {}
    return str(claims.get("name") or claims.get("email") or "Instructor")[:100]


def create_class(req: Request):
    staff = require_staff(req.auth)
    if not (staff.is_admin or staff.is_teacher):
        raise Forbidden("Only instructors, external teachers and administrators can create classes")
    body = req.json()
    validate.reject_unknown(body, ("name", "orgId", "cohortId", "termStart", "termEnd"))
    name = validate.text(body, "name")
    if staff.is_admin:
        org_id = validate.safe_id(body.get("orgId"), "orgId")
    else:
        # Teachers create classes only in the school an admin assigned to them.
        profile = db.get_table(db.CORE).get_item(Key={"pk": f"USR#{staff.user_id}", "sk": "META"}).get("Item", {})
        org_id = profile.get("orgId")
        if not org_id:
            raise Forbidden("Your account has no school yet. Ask a CIC admin to assign one")
        if body.get("orgId") not in (None, org_id):
            raise Forbidden("Teachers can only create classes in their own school")
    cohort_id = body.get("cohortId")
    if cohort_id is not None:
        validate.safe_id(cohort_id, "cohortId")
    start, end = validate.date_text(body, "termStart"), validate.date_text(body, "termEnd")
    if start and end and end < start:
        raise ValidationError("termEnd must not be before termStart")

    table = db.get_table(db.CORE)
    org = table.get_item(Key={"pk": f"ORG#{org_id}", "sk": "META"}).get("Item")
    if not org or org.get("status") != "active":
        raise ValidationError("orgId does not match an active organization")
    external = org.get("kind", "cic") == "external"
    if staff.is_admin and external:
        raise Forbidden("CIC administrators cannot create classes in an external school")
    if staff.is_external != external:  # each kind of teacher works only in its own kind of school
        raise Forbidden("Your account cannot create classes in this school")
    if external and cohort_id:
        raise ValidationError("External classes cannot join a CIC cohort")
    if cohort_id and not _exists(table, f"COH#{cohort_id}"):
        raise ValidationError("cohortId does not match a cohort")

    class_id = f"cls_{uuid.uuid4().hex[:12]}"
    now = utc_now_iso()
    for _ in range(5):  # a join code collision is rare; retry with a new code
        code = new_join_code()
        meta = {"pk": f"CLS#{class_id}", "sk": "META", "name": name, "orgId": org_id, "status": "active",
                "joinCode": code, "createdAt": now, "createdBy": staff.user_id,
                "ownerKind": "external" if external else "cic",
                # CIC's class list holds CIC classes only. External classes sit in their own list,
                # which only the usage report reads, so no admin screen can reach their students.
                "gsi1pk": "LIST#XCLS" if external else "LIST#CLS", "gsi1sk": f"CLS#{class_id}",
                "gsi3pk": f"JOIN#{code}", "gsi3sk": f"CLS#{class_id}"}  # student login lookup
        for field, value in (("cohortId", cohort_id), ("termStart", start), ("termEnd", end)):
            if value:
                meta[field] = value
        if cohort_id:
            meta.update(gsi2pk=f"COH#{cohort_id}", gsi2sk=f"CLS#{class_id}")
        member = {"pk": f"CLS#{class_id}", "sk": f"INS#{staff.user_id}", "name": _staff_name(req),
                  "gsi1pk": f"USR#{staff.user_id}", "gsi1sk": f"CLS#{class_id}", "addedAt": now}
        lock = {"pk": f"JOIN#{code}", "sk": "META", "classId": class_id}  # keeps codes unique
        try:
            table.meta.client.transact_write_items(TransactItems=[
                {"Put": {"TableName": table.name, "Item": meta, "ConditionExpression": "attribute_not_exists(pk)"}},
                {"Put": {"TableName": table.name, "Item": member}},
                {"Put": {"TableName": table.name, "Item": lock, "ConditionExpression": "attribute_not_exists(pk)"}},
            ])
            return Reply(data=dict(public(meta), instructors=[{"userId": staff.user_id, "name": member["name"]}]), status=201)
        except ClientError as err:
            if err.response["Error"]["Code"] != "TransactionCanceledException":
                raise
    raise Conflict("Could not allocate a class code. Try again")


def list_classes(req: Request):
    staff = require_staff(req.auth)
    table = db.get_table(db.CORE)
    if staff.is_admin:
        org_id, cohort_id = req.query.get("orgId"), req.query.get("cohortId")
        keys = ("pk", "sk", "gsi1pk", "gsi1sk")
        query = {"IndexName": "gsi1", "KeyConditionExpression": Key("gsi1pk").eq("LIST#CLS")}
        if cohort_id:
            keys = ("pk", "sk", "gsi2pk", "gsi2sk")
            query = {"IndexName": "gsi2", "KeyConditionExpression": Key("gsi2pk").eq(f"COH#{validate.safe_id(cohort_id, 'cohortId')}")}
        if org_id:
            query["FilterExpression"] = Attr("orgId").eq(validate.safe_id(org_id, "orgId"))
        items, cursor = paging.query_page(table, req, keys, **query)
        names = {}
        return Reply(data=[with_instructors(table, i, names) for i in items], meta={"nextCursor": cursor})
    if not staff.is_teacher:
        raise Forbidden("Only instructors, external teachers and administrators can list classes")
    names = {}
    memberships, cursor = paging.query_page(
        table, req, ("pk", "sk", "gsi1pk", "gsi1sk"),
        IndexName="gsi1", KeyConditionExpression=Key("gsi1pk").eq(f"USR#{staff.user_id}"))
    classes = []
    for m in memberships:
        meta = table.get_item(Key={"pk": m["gsi1sk"], "sk": "META"}).get("Item")
        if meta:
            classes.append(with_instructors(table, meta, names))
    return Reply(data=classes, meta={"nextCursor": cursor})


def _class_id(req: Request) -> str:
    class_id = req.path.get("classId", "")
    try:
        return validate.safe_id(class_id, "classId")
    except ValidationError:
        raise NotFound("Class not found")


def get_class(req: Request):
    class_id = _class_id(req)
    table = db.get_table(db.CORE)
    require_class_access(req.auth, table, class_id)
    meta = table.get_item(Key={"pk": f"CLS#{class_id}", "sk": "META"}).get("Item")
    if not meta:
        raise NotFound("Class not found")
    students = table.query(
        KeyConditionExpression=Key("pk").eq(f"CLS#{class_id}") & Key("sk").begins_with("STU#"),
        Select="COUNT")["Count"]
    assignments = [public_assignment(a) for a in load_assignments(table, class_id)]
    return dict(with_instructors(table, meta, {}), assignments=assignments, counts={"students": students})


def update_class(req: Request):
    class_id = _class_id(req)
    table = db.get_table(db.CORE)
    require_class_access(req.auth, table, class_id)
    body = req.json()
    validate.reject_unknown(body, ("name", "status", "currentModuleId", "settings"))
    changes = {"name": validate.text(body, "name", required=False),
               "status": validate.choice(body, "status", STATUSES)}
    module_id = body.get("currentModuleId")
    if module_id is not None:
        validate.safe_id(module_id, "currentModuleId")
        if not db.get_table(db.CONTENT).get_item(Key={"pk": f"MOD#{module_id}", "sk": "META"}).get("Item"):
            raise ValidationError("currentModuleId does not match a module")
        changes["currentModuleId"] = module_id
    settings = body.get("settings")
    if settings is not None:
        if not isinstance(settings, dict):
            raise ValidationError("settings must be an object")
        validate.reject_unknown(settings, SETTING_LIMITS)
        current = table.get_item(Key={"pk": f"CLS#{class_id}", "sk": "META"}).get("Item", {}).get("settings") or {}
        changes["settings"] = {**current, **{k: validate.integer(v, k, *SETTING_LIMITS[k]) for k, v in settings.items()}}
    changes = {k: v for k, v in changes.items() if v is not None}
    if not changes:
        raise ValidationError("Nothing to update")
    result = table.update_item(
        Key={"pk": f"CLS#{class_id}", "sk": "META"}, ReturnValues="ALL_NEW",
        UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in changes),
        ExpressionAttributeNames={f"#{k}": k for k in changes},
        ExpressionAttributeValues={f":{k}": v for k, v in changes.items()})
    return public(result["Attributes"])


def add_member(req: Request):
    admin = require_admin(req.auth)
    class_id = _class_id(req)
    body = req.json()
    validate.reject_unknown(body, ("userId",))
    user_id = validate.safe_id(body.get("userId"), "userId")
    table = db.get_table(db.CORE)
    meta = table.get_item(Key={"pk": f"CLS#{class_id}", "sk": "META"}).get("Item")
    if not meta:
        raise NotFound("Class not found")
    if meta.get("ownerKind") == "external":
        raise Forbidden("CIC cannot add people to an external teacher's class")
    try:
        groups = cognito().admin_list_groups_for_user(UserPoolId=os.environ["USER_POOL_ID"], Username=user_id)["Groups"]
    except ClientError as err:
        if err.response["Error"]["Code"] == "UserNotFoundException":
            raise ValidationError("userId does not match a staff user")
        raise
    if INSTRUCTOR not in [g["GroupName"] for g in groups]:
        raise ValidationError("Only instructors can be added to a class")
    table.put_item(Item={"pk": f"CLS#{class_id}", "sk": f"INS#{user_id}", "gsi1pk": f"USR#{user_id}",
                         "gsi1sk": f"CLS#{class_id}", "addedAt": utc_now_iso(), "addedBy": admin.user_id,
                         "name": _cognito_name(user_id)})
    return Reply(data={"classId": class_id, "userId": user_id}, status=201)


ROUTES = {
    "POST /v1/classes": create_class,
    "GET /v1/classes": list_classes,
    "GET /v1/classes/{classId}": get_class,
    "PATCH /v1/classes/{classId}": update_class,
    "POST /v1/classes/{classId}/members": add_member,
}
