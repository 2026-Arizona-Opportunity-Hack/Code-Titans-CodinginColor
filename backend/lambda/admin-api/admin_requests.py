"""Access requests from external teachers: list, approve, deny. Admin only.
Approving invites the person as an external teacher (Cognito sends the invite email) in an external
school: an existing one, or a new one named after the school in the request. Nothing is shared with
the requester until an admin approves.
"""
import re
from boto3.dynamodb.conditions import Key
from admin_orgs import new_org
from admin_users import _school, invite_user
from cic import access_requests as store, audit, db, paging, validate
from cic.authz import EXTERNAL, require_admin
from cic.errors import Conflict, NotFound
from cic.http import Reply, Request
from cic.log import log
REQUEST_ID = re.compile(r"^req_[a-f0-9]{12}$")
def public(item: dict) -> dict:
    return {"requestId": item["pk"].split("#", 1)[1], "name": item["name"], "email": item["email"],
            "organization": item["organization"], "note": item.get("note"), "status": item["status"],
            "createdAt": item["createdAt"], "decidedAt": item.get("decidedAt"), "orgId": item.get("orgId")}
def _find(req: Request) -> dict:
    request_id = req.path.get("requestId", "")
    item = store.get(request_id) if REQUEST_ID.match(request_id) else None
    if not item:
        raise NotFound("Request not found")
    return item
def list_requests(req: Request):
    require_admin(req.auth)
    status = validate.choice(req.query, "status", store.STATUSES) or "pending"
    items, cursor = paging.query_page(
        db.get_table(db.CORE), req, ("pk", "sk", "gsi2pk", "gsi2sk"),
        IndexName="gsi2", KeyConditionExpression=Key("gsi2pk").eq(store.list_key(status)), ScanIndexForward=False)
    return Reply(data=[public(i) for i in items], meta={"nextCursor": cursor})
def approve(req: Request):
    admin = require_admin(req.auth)
    item = _find(req)
    if item["status"] != "pending":
        raise Conflict("This request has already been decided")
    body = req.json() if req.raw_body else {}  # the body is optional: {"orgId"} picks an existing school
    validate.reject_unknown(body, ("orgId",))
    org_id = _school(body) if body.get("orgId") else None  # an existing school, or a new one named in the request
    created_org = None
    if not org_id:
        created_org = new_org(item["organization"], "external")
        org_id = created_org["pk"].split("#", 1)[1]
    try:
        _, user_id = invite_user(admin.user_id, item["email"], item["name"], EXTERNAL, False, org_id)
    except Exception:
        if created_org:  # leave no empty school behind
            db.get_table(db.CORE).delete_item(Key={"pk": created_org["pk"], "sk": "META"})
        raise
    decided = store.decide(item, "approved", admin.user_id, orgId=org_id, userId=user_id)
    audit.record(admin.user_id, "access_request_approved", {"requestId": decided["pk"].split("#", 1)[1], "orgId": org_id, "userId": user_id})
    log("access_request_approved", requestId=decided["pk"].split("#", 1)[1], by=admin.user_id)
    return public(decided)
def deny(req: Request):
    admin = require_admin(req.auth)
    item = _find(req)
    decided = store.decide(item, "denied", admin.user_id)
    audit.record(admin.user_id, "access_request_denied", {"requestId": decided["pk"].split("#", 1)[1]})
    return public(decided)
ROUTES = {
    "GET /v1/admin/access-requests": list_requests,
    "POST /v1/admin/access-requests/{requestId}/approve": approve,
    "POST /v1/admin/access-requests/{requestId}/deny": deny,
}
