"""Input validation at the trust boundary. Raises ValidationError with a clear message."""
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

