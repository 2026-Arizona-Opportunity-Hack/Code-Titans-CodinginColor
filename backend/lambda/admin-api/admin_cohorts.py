"""Cohorts: GET/POST /v1/admin/cohorts, PATCH /v1/admin/cohorts/{cohortId}. Admin only.

A cohort holds one or more classes. A class points at its cohort with `cohortId`
and the gsi2 keys (gsi2pk = COH#<id>, gsi2sk = CLS#<id>), which is what rollups query.
"""
import re
import uuid

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from cic import db, paging, validate
from cic.authz import require_admin
from cic.errors import NotFound, ValidationError
from cic.http import Reply, Request
from cic.ids import utc_now_iso

COHORT_ID = re.compile(r"^coh_[a-z0-9]{12}$")
STATUSES = ("active", "archived")
MAX_CLASSES = 50


def public(item: dict) -> dict:
    out = {"cohortId": item["pk"].split("#", 1)[1], "name": item["name"],
           "status": item["status"], "createdAt": item["createdAt"]}
    if item.get("orgId"):
        out["orgId"] = item["orgId"]
    return out


def list_cohorts(req: Request):
    require_admin(req.auth)
    items, cursor = paging.query_page(
        db.get_table(db.CORE), req, ("pk", "sk", "gsi2pk", "gsi2sk"),
        IndexName="gsi2", KeyConditionExpression=Key("gsi2pk").eq("LIST#COH"))
    return Reply(data=[public(i) for i in items], meta={"nextCursor": cursor})


def create_cohort(req: Request):
    require_admin(req.auth)
    body = req.json()
    validate.reject_unknown(body, ("name", "orgId"))
    table = db.get_table(db.CORE)
    org_id = validate.text(body, "orgId", 64, required=False)
    if org_id and not table.get_item(Key={"pk": f"ORG#{org_id}", "sk": "META"}).get("Item"):
        raise ValidationError("orgId does not match an organization")
    cohort_id = f"coh_{uuid.uuid4().hex[:12]}"
    item = {"pk": f"COH#{cohort_id}", "sk": "META", "name": validate.text(body, "name"),
            "status": "active", "createdAt": utc_now_iso(),
            "gsi2pk": "LIST#COH", "gsi2sk": f"COH#{cohort_id}"}
    if org_id:
        item["orgId"] = org_id
    table.put_item(Item=item)
    return Reply(data=public(item), status=201)


def _class_ids(table, cohort_id: str) -> list:
    items = db.query_all(table, IndexName="gsi2",
                         KeyConditionExpression=Key("gsi2pk").eq(f"COH#{cohort_id}"))
    return [i["gsi2sk"].split("#", 1)[1] for i in items]


def _set_membership(table, cohort_id: str, wanted: list) -> None:
    """Make `wanted` the exact set of classes in the cohort. Classes move if elsewhere."""
    for class_id in wanted:
        meta = table.get_item(Key={"pk": f"CLS#{class_id}", "sk": "META"}).get("Item")
        if not meta:
            raise ValidationError(f"classIds contains an unknown class: {class_id}")
        if meta.get("ownerKind") == "external":
            raise ValidationError(f"External classes cannot join a cohort: {class_id}")
    current = _class_ids(table, cohort_id)
    for class_id in wanted:
        table.update_item(
            Key={"pk": f"CLS#{class_id}", "sk": "META"},
            UpdateExpression="SET cohortId = :c, gsi2pk = :p, gsi2sk = :s",
            ExpressionAttributeValues={":c": cohort_id, ":p": f"COH#{cohort_id}", ":s": f"CLS#{class_id}"})
    for class_id in set(current) - set(wanted):
        table.update_item(Key={"pk": f"CLS#{class_id}", "sk": "META"},
                          UpdateExpression="REMOVE cohortId, gsi2pk, gsi2sk")


def update_cohort(req: Request):
    require_admin(req.auth)
    cohort_id = req.path.get("cohortId", "")
    if not COHORT_ID.match(cohort_id):
        raise NotFound("Cohort not found")
    body = req.json()
    validate.reject_unknown(body, ("name", "status", "classIds"))
    changes = {"name": validate.text(body, "name", required=False),
               "status": validate.choice(body, "status", STATUSES)}
    changes = {k: v for k, v in changes.items() if v is not None}
    class_ids = validate.string_list(body, "classIds", MAX_CLASSES)
    if not changes and class_ids is None:
        raise ValidationError("Nothing to update")

    table = db.get_table(db.CORE)
    key = {"pk": f"COH#{cohort_id}", "sk": "META"}
    if not table.get_item(Key=key).get("Item"):
        raise NotFound("Cohort not found")
    if class_ids is not None:
        _set_membership(table, cohort_id, class_ids)
    attrs = table.get_item(Key=key)["Item"]
    if changes:
        try:
            attrs = table.update_item(
                Key=key, ReturnValues="ALL_NEW", ConditionExpression="attribute_exists(pk)",
                UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in changes),
                ExpressionAttributeNames={f"#{k}": k for k in changes},
                ExpressionAttributeValues={f":{k}": v for k, v in changes.items()})["Attributes"]
        except ClientError as err:
            if err.response["Error"]["Code"] == "ConditionalCheckFailedException":
                raise NotFound("Cohort not found")
            raise
    return dict(public(attrs), classIds=sorted(_class_ids(table, cohort_id)))


ROUTES = {
    "GET /v1/admin/cohorts": list_cohorts,
    "POST /v1/admin/cohorts": create_cohort,
    "PATCH /v1/admin/cohorts/{cohortId}": update_cohort,
}
