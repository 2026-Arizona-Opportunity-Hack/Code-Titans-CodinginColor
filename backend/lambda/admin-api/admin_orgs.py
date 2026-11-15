"""Partner schools: GET/POST /v1/admin/orgs, PATCH /v1/admin/orgs/{orgId}. Admin only."""
import re
import uuid

from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError

from cic import db, paging, validate
from cic.authz import require_admin
from cic.errors import NotFound, ValidationError
from cic.http import Reply, Request
from cic.ids import utc_now_iso

ORG_ID = re.compile(r"^org_[a-z0-9]{12}$")
STATUSES = ("active", "archived")
KINDS = ("cic", "external")  # "external" is a partner school's own space: CIC sees usage only


def public(item: dict) -> dict:
    return {"orgId": item["pk"].split("#", 1)[1], "name": item["name"], "kind": item.get("kind", "cic"),
            "status": item["status"], "createdAt": item["createdAt"]}


def list_orgs(req: Request):
    require_admin(req.auth)
    items, cursor = paging.query_page(
        db.get_table(db.CORE), req, ("pk", "sk", "gsi2pk", "gsi2sk"),
        IndexName="gsi2", KeyConditionExpression=Key("gsi2pk").eq("LIST#ORG"))
    return Reply(data=[public(i) for i in items], meta={"nextCursor": cursor})


def create_org(req: Request):
    require_admin(req.auth)
    body = req.json()
    validate.reject_unknown(body, ("name", "kind"))
    org_id = f"org_{uuid.uuid4().hex[:12]}"
    item = {"pk": f"ORG#{org_id}", "sk": "META", "name": validate.text(body, "name"),
            "kind": validate.choice(body, "kind", KINDS) or "cic", "status": "active", "createdAt": utc_now_iso(),
            "gsi2pk": "LIST#ORG", "gsi2sk": f"ORG#{org_id}"}
    db.get_table(db.CORE).put_item(Item=item)
    return Reply(data=public(item), status=201)


def update_org(req: Request):
    require_admin(req.auth)
    org_id = req.path.get("orgId", "")
    if not ORG_ID.match(org_id):
        raise NotFound("Organization not found")
    body = req.json()
    validate.reject_unknown(body, ("name", "status"))
    changes = {"name": validate.text(body, "name", required=False),
               "status": validate.choice(body, "status", STATUSES)}
    changes = {k: v for k, v in changes.items() if v is not None}
    if not changes:
        raise ValidationError("Nothing to update")
    try:
        result = db.get_table(db.CORE).update_item(
            Key={"pk": f"ORG#{org_id}", "sk": "META"},
            UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in changes),
            ConditionExpression="attribute_exists(pk)",
            ExpressionAttributeNames={f"#{k}": k for k in changes},
            ExpressionAttributeValues={f":{k}": v for k, v in changes.items()},
            ReturnValues="ALL_NEW")
    except ClientError as err:
        if err.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise NotFound("Organization not found")
        raise
    return public(result["Attributes"])


ROUTES = {
    "GET /v1/admin/orgs": list_orgs,
    "POST /v1/admin/orgs": create_org,
    "PATCH /v1/admin/orgs/{orgId}": update_org,
}
