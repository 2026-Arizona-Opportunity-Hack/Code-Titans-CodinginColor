"""Cursor pagination for list endpoints: ?limit= (default 50, max 200) and ?cursor=."""
import base64
import json
from typing import Any, Dict, Optional, Tuple

from . import db
from .errors import ValidationError
from .http import Request

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


def parse_limit(req: Request) -> int:
    raw = req.query.get("limit")
    if raw is None:
        return DEFAULT_LIMIT
    if not raw.isdigit() or not 1 <= int(raw) <= MAX_LIMIT:
        raise ValidationError(f"limit must be a number from 1 to {MAX_LIMIT}")
    return int(raw)


def encode_cursor(key: Dict[str, Any]) -> str:
    return base64.urlsafe_b64encode(json.dumps(key).encode("utf-8")).decode("ascii")


def decode_cursor(raw: Optional[str], allowed_keys: Tuple[str, ...]) -> Optional[dict]:
    if not raw:
        return None
    try:
        key = json.loads(base64.urlsafe_b64decode(raw.encode("ascii")))
    except (ValueError, UnicodeError):
        raise ValidationError("cursor is not valid")
    if (not isinstance(key, dict) or set(key) != set(allowed_keys)
            or not all(isinstance(v, str) for v in key.values())):
        raise ValidationError("cursor is not valid")
    return key


def query_page(table: Any, req: Request, key_names: Tuple[str, ...], **query: Any):
    """Run one page of a query. Returns (items, nextCursor or None)."""
    start = decode_cursor(req.query.get("cursor"), key_names)
    kwargs = dict(query, Limit=parse_limit(req))
    if start:
        kwargs["ExclusiveStartKey"] = start
    page = table.query(**kwargs)
    last = page.get("LastEvaluatedKey")
    return page.get("Items", []), (encode_cursor(last) if last else None)
