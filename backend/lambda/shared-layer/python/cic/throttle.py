"""Per-class login failure counter: 10 failures in 5 minutes locks that class code.

A failed guess cannot be tied to a student, so the limit is per class. It never
clears on a successful login, so one valid credential cannot reset the counter
and be used to keep guessing classmates' words.
"""
import time
from typing import Optional

from boto3.dynamodb.conditions import Attr
from botocore.exceptions import ClientError

from . import db

MAX_FAILURES = 10
WINDOW_SECONDS = 5 * 60


def _key(class_id: str) -> dict:
    return {"pk": f"CLS#{class_id}", "sk": "THROTTLE"}


def retry_after(class_id: str, now: Optional[int] = None) -> int:
    """Seconds until logins are allowed again, or 0 if the class is not locked."""
    now = int(time.time()) if now is None else int(now)
    item = db.get_table(db.CORE).get_item(Key=_key(class_id), ConsistentRead=True).get("Item")
    if item and int(item["windowEnd"]) > now and int(item["failures"]) >= MAX_FAILURES:
        return int(item["windowEnd"]) - now
    return 0


def record_failure(class_id: str, now: Optional[int] = None) -> None:
    now = int(time.time()) if now is None else int(now)
    table = db.get_table(db.CORE)
    try:
        table.update_item(
            Key=_key(class_id),
            UpdateExpression="ADD failures :one",
            ConditionExpression=Attr("windowEnd").gt(now),
            ExpressionAttributeValues={":one": 1},
        )
    except ClientError as err:
        if err.response["Error"]["Code"] != "ConditionalCheckFailedException":
            raise
        end = now + WINDOW_SECONDS
        table.put_item(Item={**_key(class_id), "failures": 1, "windowEnd": end, "ttl": end + 60})
