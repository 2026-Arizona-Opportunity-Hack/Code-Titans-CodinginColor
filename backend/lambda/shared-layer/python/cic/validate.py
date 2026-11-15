"""Input validation at the trust boundary. Raises ValidationError with a clear message."""
import datetime
import re
from typing import Iterable, Optional

from .errors import ValidationError


def reject_unknown(body: dict, allowed: Iterable[str]) -> None:
    """Refuse fields we do not handle, so a request cannot set arbitrary attributes."""
    extra = sorted(set(body) - set(allowed))
    if extra:
        raise ValidationError(f"Unknown field: {extra[0]}")


def text(body: dict, field: str, max_len: int = 100, required: bool = True) -> Optional[str]:
    value = body.get(field)
    if value is None:
        if required:
            raise ValidationError(f"{field} is required")
        return None
    if not isinstance(value, str) or not value.strip():
        raise ValidationError(f"{field} must be a non-empty string")
    value = value.strip()
    if len(value) > max_len:
        raise ValidationError(f"{field} must be at most {max_len} characters")
    return value


def choice(body: dict, field: str, options: Iterable[str]) -> Optional[str]:
    value = body.get(field)
    if value is None:
        return None
    options = tuple(options)
    if value not in options:
        raise ValidationError(f"{field} must be one of: {', '.join(options)}")
    return value


def string_list(body: dict, field: str, max_items: int, max_len: int = 64) -> Optional[list]:
    value = body.get(field)
    if value is None:
        return None
    if not isinstance(value, list) or len(value) > max_items:
        raise ValidationError(f"{field} must be a list of at most {max_items} items")
    for item in value:
        if not isinstance(item, str) or not item or len(item) > max_len:
            raise ValidationError(f"{field} must contain non-empty strings")
    return list(dict.fromkeys(value))  # de-duplicate, keep order



_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")
_DATE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def safe_id(value, label: str = "id") -> str:
    """IDs from URLs or bodies go into DynamoDB keys, so they must not contain '#'."""
    if not isinstance(value, str) or not _SAFE_ID.match(value):
        raise ValidationError(f"{label} is not valid")
    return value


def date_text(body: dict, field: str) -> Optional[str]:
    value = body.get(field)
    if value is None:
        return None
    if not isinstance(value, str) or not _DATE.match(value):
        raise ValidationError(f"{field} must be a date like 2026-09-01")
    try:
        datetime.date.fromisoformat(value)
    except ValueError:
        raise ValidationError(f"{field} must be a real date")
    return value


def integer(value, label: str, low: int, high: int) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not low <= value <= high:
        raise ValidationError(f"{label} must be a whole number from {low} to {high}")
    return value
