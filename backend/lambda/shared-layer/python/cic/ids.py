"""ID and time helpers."""
import uuid
from datetime import datetime, timezone


def new_id() -> str:
    """Random UUID v4. Used for studentId and other opaque IDs."""
    return str(uuid.uuid4())


def utc_now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
