"""Opaque student sessions. Only sha256(token) is stored, never the token."""
import hashlib
import secrets
import time
from typing import Optional

from . import db

SESSION_TTL_SECONDS = 8 * 60 * 60


def _hash(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def create_session(student_id: str, class_id: str, cred_version: int, now: Optional[int] = None):
    """Return (token, expires_epoch). The token has 128 bits of randomness."""
    now = int(time.time()) if now is None else int(now)
    token = "ses_" + secrets.token_urlsafe(16)
    expires = now + SESSION_TTL_SECONDS
    db.get_table(db.CORE).put_item(Item={
        "pk": f"SES#{_hash(token)}", "sk": "META",
        "studentId": student_id, "classId": class_id,
        "credVersion": cred_version, "ttl": expires,
    })
    return token, expires


def resolve_session(token: str, now: Optional[int] = None) -> Optional[dict]:
    """Return the session item for a known, unexpired token, else None."""
    now = int(time.time()) if now is None else int(now)
    if not isinstance(token, str) or not token.startswith("ses_") or len(token) > 64:
        return None
    item = db.get_table(db.CORE).get_item(Key={"pk": f"SES#{_hash(token)}", "sk": "META"}).get("Item")
    if not item or int(item["ttl"]) <= now:  # DynamoDB TTL deletes lazily, so check here too
        return None
    return item


def delete_session(token: str) -> None:
    db.get_table(db.CORE).delete_item(Key={"pk": f"SES#{_hash(token)}", "sk": "META"})
