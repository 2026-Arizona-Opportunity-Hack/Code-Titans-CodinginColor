"""ID and time helpers."""
import time
import uuid
from datetime import datetime, timezone


def new_id() -> str:
    """Random UUID v4. Used for studentId and other opaque IDs."""
    return str(uuid.uuid4())


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def now_ms() -> int:
    return int(time.time() * 1000)


def to_ms(value) -> int:
    """Epoch milliseconds from an ISO-8601 string (as the class API stores them), or from epoch
    seconds or milliseconds. Returns 0 when the value is missing or cannot be read."""
    if value is None or value == "":
        return 0
    if isinstance(value, str):
        try:
            return int(datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp() * 1000)
        except ValueError:
            return 0
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 0
    return number * 1000 if number < 100_000_000_000 else number  # seconds vs milliseconds
