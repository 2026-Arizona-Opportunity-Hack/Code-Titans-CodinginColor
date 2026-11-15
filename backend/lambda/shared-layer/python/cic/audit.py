"""Audit log entries in the events table. Records who did what, never student content."""
import time
from typing import Any, Dict

from . import db
from .ids import new_id

RETENTION_SECONDS = 365 * 24 * 3600


def record(actor_id: str, action: str, details: Dict[str, Any] = None) -> None:
    now = time.time()
    month = time.strftime("%Y-%m", time.gmtime(now))
    item = {
        "pk": f"AUD#{month}",
        "sk": f"{int(now * 1000):013d}#{new_id()}",
        "actor": actor_id,
        "action": action,
        "details": details or {},
        "ttl": int(now) + RETENTION_SECONDS,
    }
    db.get_table(db.EVENTS).put_item(Item=db.to_dynamo(item))
