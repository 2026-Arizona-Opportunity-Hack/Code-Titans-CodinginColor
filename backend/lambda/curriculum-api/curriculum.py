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
from cic.errors import Forbidden, NotFound, ValidationError
from cic.http import Reply, Request
from cic.ids import utc_now_iso
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


ROUTES = {
    "GET /v1/curriculum/modules": list_modules,
    "POST /v1/curriculum/modules": create_module,
    "GET /v1/curriculum/modules/{moduleId}": get_module,
}
