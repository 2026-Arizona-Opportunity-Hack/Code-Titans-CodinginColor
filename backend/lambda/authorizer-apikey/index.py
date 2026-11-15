"""Lambda authorizer (HTTP API, payload v2, simple response) for the CIC dashboard's API key.

Key format: cic_<keyId>_<secret>. The key item (pk KEY#<keyId>, sk META) holds secretHash
(sha256 hex of the secret), scopes (list), and optionally revokedAt. Only the hash is stored.
API Gateway caches the answer for 60 seconds, so a revoked key stops working within a minute.
"""
import hmac
import re

from cic import db, keys
from cic.ids import utc_now_iso
from cic.log import log

PREFIX = "cic_"
KEY_ID = re.compile(r"[A-Za-z0-9]{8,32}")  # no underscore, so the first "_" ends the key ID


def _deny():
    return {"isAuthorized": False}


def authorize(header_value):
    value = (header_value or "").strip()
    if not value.startswith(PREFIX) or len(value) > 200:
        return _deny()
    key_id, sep, secret = value[len(PREFIX):].partition("_")
    if not sep or not secret or not KEY_ID.fullmatch(key_id):
        return _deny()
    core = db.get_table(db.CORE)
    item = core.get_item(Key={"pk": keys.key_pk(key_id), "sk": "META"}).get("Item")
    if not item or item.get("revokedAt"):
        return _deny()
    if not hmac.compare_digest(str(item.get("secretHash", "")), keys.sha256_hex(secret)):
        return _deny()
    try:  # best effort: lastUsedAt helps admins spot unused keys
        core.update_item(Key={"pk": keys.key_pk(key_id), "sk": "META"}, UpdateExpression="SET lastUsedAt = :n",
                         ExpressionAttributeValues={":n": utc_now_iso()})
    except Exception:
        pass
    scopes = item.get("scopes") or []
    return {"isAuthorized": True, "context": {"keyId": key_id, "scopes": ",".join(sorted(scopes))}}


def lambda_handler(event, context):
    try:
        return authorize((event.get("headers") or {}).get("x-api-key"))
    except Exception as e:  # fail closed, including malformed key IDs
        log("authorizer_error", level="ERROR", errorType=type(e).__name__)
        return _deny()
