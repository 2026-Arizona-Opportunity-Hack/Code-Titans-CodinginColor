"""API keys for the CIC dashboard (docs/api.md section 2). Admin only.

  GET    /v1/admin/api-keys           list keys (never the secret)
  POST   /v1/admin/api-keys           create a key; the full key is in this response only
  DELETE /v1/admin/api-keys/{keyId}   revoke a key

The key format and item shape are what authorizer-apikey checks: the key is
cic_<keyId>_<secret>, and only sha256(secret) is stored.
"""
import re
import secrets

from boto3.dynamodb.conditions import Key

from cic import audit, db, keys, paging, validate
from cic.authz import require_admin
from cic.errors import NotFound, ValidationError
from cic.http import Reply, Request
from cic.ids import utc_now_iso

SCOPES = ("read:cohorts",)
MAX_ACTIVE_KEYS = 10
KEY_ID = re.compile(r"^[a-z0-9]{12}$")


def public(item: dict) -> dict:
    return {"keyId": item["pk"].split("#", 1)[1], "label": item["label"], "scopes": sorted(item.get("scopes", [])),
            "createdAt": item["createdAt"], "createdBy": item["createdBy"], "lastUsedAt": item.get("lastUsedAt"),
            "revoked": bool(item.get("revokedAt")), "revokedAt": item.get("revokedAt")}


def list_keys(req: Request):
    require_admin(req.auth)
    items, cursor = paging.query_page(
        db.get_table(db.CORE), req, ("pk", "sk", "gsi2pk", "gsi2sk"),
        IndexName="gsi2", KeyConditionExpression=Key("gsi2pk").eq("LIST#KEY"))
    return Reply(data=[public(i) for i in items], meta={"nextCursor": cursor})


def create_key(req: Request):
    staff = require_admin(req.auth)
    body = req.json()
    validate.reject_unknown(body, ("label", "scopes"))
    label = validate.text(body, "label", 80)
    scopes = validate.string_list(body, "scopes", len(SCOPES))
    if not scopes or any(s not in SCOPES for s in scopes):
        raise ValidationError("scopes must be a list drawn from: " + ", ".join(SCOPES))
    table = db.get_table(db.CORE)
    active = [i for i in db.query_all(table, IndexName="gsi2", KeyConditionExpression=Key("gsi2pk").eq("LIST#KEY")) if not i.get("revokedAt")]
    if len(active) >= MAX_ACTIVE_KEYS:
        raise ValidationError(f"There are already {MAX_ACTIVE_KEYS} active keys. Revoke one first")
    key_id, secret = secrets.token_hex(6), secrets.token_urlsafe(32)
    item = {"pk": keys.key_pk(key_id), "sk": "META", "secretHash": keys.sha256_hex(secret), "scopes": sorted(set(scopes)),
            "label": label, "createdBy": staff.user_id, "createdAt": utc_now_iso(), "gsi2pk": "LIST#KEY", "gsi2sk": f"KEY#{key_id}"}
    table.put_item(Item=item, ConditionExpression="attribute_not_exists(pk)")
    audit.record(staff.user_id, "api_key_created", {"keyId": key_id, "label": label})
    return Reply(data={**public(item), "key": f"cic_{key_id}_{secret}"}, status=201)


def revoke_key(req: Request):
    staff = require_admin(req.auth)
    key_id = req.path.get("keyId", "")
    if not KEY_ID.match(key_id):
        raise NotFound("API key not found")
    table = db.get_table(db.CORE)
    item = table.get_item(Key={"pk": keys.key_pk(key_id), "sk": "META"}).get("Item")
    if not item:
        raise NotFound("API key not found")
    if not item.get("revokedAt"):  # revoking twice is harmless
        now = utc_now_iso()
        table.update_item(Key={"pk": keys.key_pk(key_id), "sk": "META"}, UpdateExpression="SET revokedAt = :n",
                          ExpressionAttributeValues={":n": now})
        item["revokedAt"] = now
        audit.record(staff.user_id, "api_key_revoked", {"keyId": key_id})
    return public(item)


ROUTES = {
    "GET /v1/admin/api-keys": list_keys,
    "POST /v1/admin/api-keys": create_key,
    "DELETE /v1/admin/api-keys/{keyId}": revoke_key,
}
