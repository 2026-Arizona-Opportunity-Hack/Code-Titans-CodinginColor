"""GET /v1/admin/audit?from=&to=&limit=: who did what (key created or revoked, exports). Admin only.

Entries live in the events table under AUD#<yyyy-mm>, newest last in the key. Details hold IDs
only, never student names or content. Entries expire after a year (TTL).
"""
import time
from datetime import datetime, timedelta, timezone

from boto3.dynamodb.conditions import Key

from cic import db, paging
from cic.authz import require_admin
from cic.errors import ValidationError
from cic.http import Reply, Request

MAX_RANGE_DAYS = 366
DEFAULT_RANGE_DAYS = 30


def _day(raw, end_of_day: bool = False):
    try:
        day = datetime.strptime(raw, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except (TypeError, ValueError):
        raise ValidationError("Dates must look like 2026-11-15")
    return day + timedelta(days=1) - timedelta(milliseconds=1) if end_of_day else day


def _months(start: datetime, end: datetime):
    """Month keys from the latest back to the earliest."""
    year, month = end.year, end.month
    while (year, month) >= (start.year, start.month):
        yield f"{year:04d}-{month:02d}"
        year, month = (year, month - 1) if month > 1 else (year - 1, 12)


def list_audit(req: Request):
    require_admin(req.auth)
    end = _day(req.query["to"], True) if req.query.get("to") else datetime.now(timezone.utc)
    start = _day(req.query["from"]) if req.query.get("from") else end - timedelta(days=DEFAULT_RANGE_DAYS)
    if start > end or (end - start).days > MAX_RANGE_DAYS:
        raise ValidationError(f"from must be before to, and the range at most {MAX_RANGE_DAYS} days")
    limit = paging.parse_limit(req)
    low, high = f"{int(start.timestamp() * 1000):013d}", f"{int(end.timestamp() * 1000):013d}~"
    table, out = db.get_table(db.EVENTS), []
    for month in _months(start, end):
        resp = table.query(KeyConditionExpression=Key("pk").eq(f"AUD#{month}") & Key("sk").between(low, high),
                           ScanIndexForward=False, Limit=limit - len(out))
        out += resp["Items"]
        if len(out) >= limit:
            break
    entries = [{"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(int(i["sk"].split("#")[0]) / 1000)),
                "actor": i["actor"], "action": i["action"], "details": i.get("details", {})} for i in out]
    return Reply(data=entries, meta={"from": start.strftime("%Y-%m-%d"), "to": end.strftime("%Y-%m-%d")})


ROUTES = {"GET /v1/admin/audit": list_audit}
