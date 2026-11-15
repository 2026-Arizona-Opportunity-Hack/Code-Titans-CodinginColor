"""Requests from external teachers who want an account, in the core table.

A request is `REQ#<id>` / `META`, listed by status through gsi2 (`LIST#REQ#<status>`). A second item,
`REQMAIL#<sha256 of the lowercased email>`, makes the email unique so one person cannot queue many
requests. The email is stored in the request because the approving admin needs it to send the invite.
Pending requests expire after 60 days, and decided ones after a year (core table TTL).
"""
import hashlib
import time
import uuid
from typing import Optional
from boto3.dynamodb.conditions import Key
from botocore.exceptions import ClientError
from . import db
from .errors import Conflict, RateLimited
from .ids import utc_now_iso
STATUSES = ("pending", "approved", "denied")
MAX_PENDING = 200  # a flood of requests stops here instead of filling the admin's list
PENDING_DAYS, DECIDED_DAYS = 60, 365
def list_key(status: str) -> str:
    return f"LIST#REQ#{status}"
def email_hash(email: str) -> str:
    return hashlib.sha256(email.strip().lower().encode("utf-8")).hexdigest()
def pending_count() -> int:
    return db.get_table(db.CORE).query(IndexName="gsi2", Select="COUNT",
                                       KeyConditionExpression=Key("gsi2pk").eq(list_key("pending")))["Count"]
def create(name: str, email: str, organization: str, note: Optional[str]) -> Optional[str]:
    """Store a pending request. Returns its ID, or None when this email already has one."""
    if pending_count() >= MAX_PENDING:
        raise RateLimited("Too many requests right now. Try again later")
    table = db.get_table(db.CORE)
    request_id = f"req_{uuid.uuid4().hex[:12]}"
    now, expires = utc_now_iso(), int(time.time()) + PENDING_DAYS * 86400
    item = {"pk": f"REQ#{request_id}", "sk": "META", "status": "pending", "name": name, "email": email.lower(),
            "organization": organization, "createdAt": now, "ttl": expires,
            "gsi2pk": list_key("pending"), "gsi2sk": f"{now}#{request_id}"}
    if note:
        item["note"] = note
    lock = {"pk": f"REQMAIL#{email_hash(email)}", "sk": "META", "requestId": request_id, "ttl": expires}
    try:
        table.meta.client.transact_write_items(TransactItems=[
            {"Put": {"TableName": table.name, "Item": db.to_dynamo(lock), "ConditionExpression": "attribute_not_exists(pk)"}},
            {"Put": {"TableName": table.name, "Item": db.to_dynamo(item)}},
        ])
    except ClientError as err:
        if err.response["Error"]["Code"] == "TransactionCanceledException":
            return None
        raise
    return request_id
def get(request_id: str) -> Optional[dict]:
    return db.get_table(db.CORE).get_item(Key={"pk": f"REQ#{request_id}", "sk": "META"}).get("Item")
def decide(item: dict, status: str, admin_id: str, **extra) -> dict:
    """Move a pending request to approved or denied. Fails with a conflict if someone else already decided it."""
    table = db.get_table(db.CORE)
    now = utc_now_iso()
    values = {":new": status, ":pending": "pending", ":list": list_key(status), ":by": admin_id, ":at": now,
              ":ttl": int(time.time()) + DECIDED_DAYS * 86400, **{f":{k}": v for k, v in extra.items()}}
    sets = ["#s = :new", "gsi2pk = :list", "decidedBy = :by", "decidedAt = :at", "#t = :ttl"] + [f"{k} = :{k}" for k in extra]
    try:
        return table.update_item(
            Key={"pk": item["pk"], "sk": "META"}, ReturnValues="ALL_NEW", ConditionExpression="#s = :pending",
            UpdateExpression="SET " + ", ".join(sets),
            ExpressionAttributeNames={"#s": "status", "#t": "ttl"}, ExpressionAttributeValues=values)["Attributes"]
    except ClientError as err:
        if err.response["Error"]["Code"] == "ConditionalCheckFailedException":
            raise Conflict("This request has already been decided")
        raise
