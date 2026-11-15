"""Curriculum modules: list, create, read.

Content table items for a module (pk MOD#<moduleId>):
  META        title, status, latestVersion (0 until published), revision, publishedRevision,
              concepts, estimatedMinutes, createdAt, updatedAt. Also the list index (gsi1).
  DRAFT       the editable document in `module`, and its `revision` counter
  V#0001 ...  immutable published snapshots, document in `module`
"""
import re
import uuid

from boto3.dynamodb.conditions import Attr, Key
from botocore.exceptions import ClientError

from access import can_author, require_author
from cic import db, paging, validate
from cic.authz import require_staff
from cic.errors import Conflict, Forbidden, NotFound, ValidationError
from cic.http import Reply, Request
from cic.ids import utc_now_iso
from moduledoc import check_draft, concepts_in, estimated_minutes, publish_problems, to_decimal
from templates import TEMPLATES

STATUS_FILTERS = ("draft", "published", "all")


def meta_key(module_id: str) -> dict:
    return {"pk": f"MOD#{module_id}", "sk": "META"}


def version_sk(version: int) -> str:
    return f"V#{version:04d}"


def module_id_from(req: Request) -> str:
    try:
        return validate.safe_id(req.path.get("moduleId", ""), "moduleId")
    except ValidationError:
        raise NotFound("Module not found")


def slugify(title: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:40].strip("-")
    return slug or "module"


def public_meta(item: dict, authoring: bool) -> dict:
    out = {"moduleId": item["pk"].split("#", 1)[1], "title": item["title"],
           "latestVersion": int(item["latestVersion"]), "concepts": item.get("concepts", []),
           "estimatedMinutes": item.get("estimatedMinutes"), "updatedAt": item["updatedAt"]}
    if authoring:
        out["status"] = "published" if int(item["latestVersion"]) > 0 else "draft"
        out["hasUnpublishedChanges"] = int(item["revision"]) != int(item.get("publishedRevision", 0))
    return out


def list_modules(req: Request):
    staff = require_staff(req.auth)
    authoring = can_author(staff)
    status = validate.choice(req.query, "status", STATUS_FILTERS) or "published"
    if status != "published" and not authoring:
        raise Forbidden("Only authors can list unpublished modules")
    query = {"IndexName": "gsi1", "KeyConditionExpression": Key("gsi1pk").eq("LIST#MOD")}
    if status == "published":
        query["FilterExpression"] = Attr("latestVersion").gt(0)
    elif status == "draft":
        query["FilterExpression"] = Attr("latestVersion").eq(0)
    items, cursor = paging.query_page(db.get_table(db.CONTENT), req, ("pk", "sk", "gsi1pk", "gsi1sk"), **query)
    return Reply(data=[public_meta(i, authoring) for i in items], meta={"nextCursor": cursor})


def create_module(req: Request):
    staff = require_author(req.auth)
    body = req.json()
    validate.reject_unknown(body, ("title", "template"))
    title = validate.text(body, "title", 120)
    template = validate.choice(body, "template", TEMPLATES) or "standard"
    table = db.get_table(db.CONTENT)
    base, now = slugify(title), utc_now_iso()
    for attempt in range(5):  # a taken slug gets a short random suffix
        module_id = base if attempt == 0 else f"{base[:35]}-{uuid.uuid4().hex[:4]}"
        meta = {**meta_key(module_id), "title": title, "latestVersion": 0, "revision": 1, "publishedRevision": 0,
                "concepts": [], "createdBy": staff.user_id, "createdAt": now, "updatedAt": now,
                "gsi1pk": "LIST#MOD", "gsi1sk": f"MOD#{module_id}"}
        draft = {"pk": f"MOD#{module_id}", "sk": "DRAFT", "module": TEMPLATES[template](module_id, title),
                 "revision": 1, "updatedAt": now, "updatedBy": staff.user_id}
        try:
            table.meta.client.transact_write_items(TransactItems=[
                {"Put": {"TableName": table.name, "Item": meta, "ConditionExpression": "attribute_not_exists(pk)"}},
                {"Put": {"TableName": table.name, "Item": draft}},
            ])
            return Reply(data={**draft["module"], "revision": 1, "draft": True}, status=201)
        except ClientError as err:
            if err.response["Error"]["Code"] != "TransactionCanceledException":
                raise
    raise ValidationError("Could not allocate a module ID. Try a different title")


def get_module(req: Request):
    staff = require_staff(req.auth)
    module_id = module_id_from(req)
    table = db.get_table(db.CONTENT)
    meta = table.get_item(Key=meta_key(module_id)).get("Item")
    if req.query.get("draft") == "true":
        if not can_author(staff):
            raise Forbidden("Only authors can read drafts")
        draft = table.get_item(Key={"pk": f"MOD#{module_id}", "sk": "DRAFT"}).get("Item")
        if not draft:
            raise NotFound("Module not found")
        return {**draft["module"], "revision": int(draft["revision"]), "draft": True}
    version = int(meta["latestVersion"]) if meta else 0
    if version < 1:
        raise NotFound("Module not found")
    snapshot = table.get_item(Key={"pk": f"MOD#{module_id}", "sk": version_sk(version)}).get("Item")
    if not snapshot:
        raise NotFound("Module not found")
    return {**snapshot["module"], "version": version}


def _expected_revision(req: Request) -> int:
    raw = (req.headers.get("if-match") or "").strip()
    raw = raw[2:] if raw.startswith("W/") else raw
    raw = raw.strip('"')
    if not raw.isdigit():
        raise ValidationError("An If-Match header with the draft's current revision is required")
    return int(raw)


def save_draft(req: Request):
    staff = require_author(req.auth)
    module_id = module_id_from(req)
    expected = _expected_revision(req)
    doc = to_decimal(req.json())
    problems = check_draft(doc, module_id)
    if problems:
        raise ValidationError("The module has problems that must be fixed before saving", details=problems)

    table = db.get_table(db.CONTENT)
    key = {"pk": f"MOD#{module_id}", "sk": "DRAFT"}
    current = table.get_item(Key=key).get("Item")
    if not current:
        raise NotFound("Module not found")
    new_revision, now = expected + 1, utc_now_iso()
    try:
        table.meta.client.transact_write_items(TransactItems=[
            {"Put": {"TableName": table.name,
                     "Item": {**key, "module": doc, "revision": new_revision, "updatedAt": now, "updatedBy": staff.user_id},
                     "ConditionExpression": "#r = :expected",
                     "ExpressionAttributeNames": {"#r": "revision"}, "ExpressionAttributeValues": {":expected": expected}}},
            {"Update": {"TableName": table.name, "Key": meta_key(module_id),
                        "UpdateExpression": "SET title = :t, concepts = :c, estimatedMinutes = :m, revision = :r, updatedAt = :u",
                        "ExpressionAttributeValues": {":t": doc["title"], ":c": concepts_in(doc), ":m": estimated_minutes(doc),
                                                      ":r": new_revision, ":u": now}}},
        ])
    except ClientError as err:
        if err.response["Error"]["Code"] != "TransactionCanceledException":
            raise
        latest = table.get_item(Key=key).get("Item", current)
        raise Conflict("Someone else saved this module. Reload it before saving again",
                       code="REVISION_CONFLICT", details={"currentRevision": int(latest["revision"])})
    return {"revision": new_revision, "updatedAt": now}


def publish(req: Request):
    staff = require_author(req.auth)
    module_id = module_id_from(req)
    table = db.get_table(db.CONTENT)
    meta = table.get_item(Key=meta_key(module_id)).get("Item")
    draft = table.get_item(Key={"pk": f"MOD#{module_id}", "sk": "DRAFT"}).get("Item")
    if not meta or not draft:
        raise NotFound("Module not found")
    if int(draft["revision"]) == int(meta.get("publishedRevision", 0)):
        raise Conflict(f"Nothing has changed since version {int(meta['latestVersion'])}", code="ALREADY_PUBLISHED")
    doc = draft["module"]
    problems = publish_problems(doc)
    if problems:
        raise ValidationError("The module is not ready to publish", details=problems)

    old, version, now = int(meta["latestVersion"]), int(meta["latestVersion"]) + 1, utc_now_iso()
    try:
        table.meta.client.transact_write_items(TransactItems=[
            {"Put": {"TableName": table.name, "ConditionExpression": "attribute_not_exists(pk)",
                     "Item": {"pk": f"MOD#{module_id}", "sk": version_sk(version), "module": doc, "version": version,
                              "revision": draft["revision"], "publishedAt": now, "publishedBy": staff.user_id}}},
            # Only if nobody saved or published since we read: the snapshot must match the draft we validated.
            {"Update": {"TableName": table.name, "Key": meta_key(module_id),
                        "ConditionExpression": "latestVersion = :old AND #r = :rev",
                        "UpdateExpression": "SET latestVersion = :v, publishedRevision = :rev, publishedAt = :now",
                        "ExpressionAttributeNames": {"#r": "revision"},
                        "ExpressionAttributeValues": {":old": old, ":v": version, ":rev": draft["revision"], ":now": now}}},
        ])
    except ClientError as err:
        if err.response["Error"]["Code"] != "TransactionCanceledException":
            raise
        raise Conflict("The module changed while publishing. Reload it and try again", code="REVISION_CONFLICT")
    return Reply(data={"moduleId": module_id, "version": version, "publishedAt": now}, status=201)


def list_versions(req: Request):
    require_author(req.auth)
    module_id = module_id_from(req)
    table = db.get_table(db.CONTENT)
    if not table.get_item(Key=meta_key(module_id)).get("Item"):
        raise NotFound("Module not found")
    rows = db.query_all(table, KeyConditionExpression=Key("pk").eq(f"MOD#{module_id}") & Key("sk").begins_with("V#"),
                        ProjectionExpression="sk, publishedAt, publishedBy")
    return sorted(({"version": int(r["sk"][2:]), "publishedAt": r["publishedAt"], "publishedBy": r["publishedBy"]}
                   for r in rows), key=lambda v: -v["version"])


def get_version(req: Request):
    require_staff(req.auth)
    module_id = module_id_from(req)
    raw = req.path.get("version", "")
    if not raw.isdigit() or not 1 <= int(raw) <= 9999:
        raise NotFound("Version not found")
    item = db.get_table(db.CONTENT).get_item(Key={"pk": f"MOD#{module_id}", "sk": version_sk(int(raw))}).get("Item")
    if not item:
        raise NotFound("Version not found")
    return {**item["module"], "version": int(raw)}


def list_concepts(req: Request):
    staff = require_staff(req.auth)
    authoring = can_author(staff)
    counts: dict = {}
    for meta in db.query_all(db.get_table(db.CONTENT), IndexName="gsi1", KeyConditionExpression=Key("gsi1pk").eq("LIST#MOD")):
        if not authoring and int(meta["latestVersion"]) < 1:
            continue  # others only see concepts of published modules
        for concept in meta.get("concepts", []):
            counts[concept] = counts.get(concept, 0) + 1
    return [{"concept": c, "moduleCount": n} for c, n in sorted(counts.items())]


ROUTES = {
    "POST /v1/curriculum/modules/{moduleId}/publish": publish,
    "GET /v1/curriculum/modules/{moduleId}/versions": list_versions,
    "GET /v1/curriculum/modules/{moduleId}/versions/{version}": get_version,
    "GET /v1/curriculum/concepts": list_concepts,
    "PUT /v1/curriculum/modules/{moduleId}/draft": save_draft,
    "GET /v1/curriculum/modules": list_modules,
    "POST /v1/curriculum/modules": create_module,
    "GET /v1/curriculum/modules/{moduleId}": get_module,
}
