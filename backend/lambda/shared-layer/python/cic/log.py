"""Structured logging that never writes student or staff PII.

CloudWatch captures stdout, so we print one JSON object per line. Log IDs and
counts only. Any field whose name is on the deny list is replaced with
"[redacted]" as a safety net, but callers should not pass those fields at all.
"""
import json
import time
from typing import Any

_DENY = {
    "displayname",
    "name",
    "email",
    "token",
    "sessiontoken",
    "code",
    "classcode",
    "studentcode",
    "words",
    "authorization",
    "x-api-key",
    "apikey",
    "csv",
    "answers",
    "body",
    "password",
}


def _clean(value: Any) -> Any:
    if isinstance(value, dict):
        return {
            k: ("[redacted]" if str(k).lower() in _DENY else _clean(v))
            for k, v in value.items()
        }
    if isinstance(value, (list, tuple)):
        return [_clean(v) for v in value]
    return value


def log(event: str, level: str = "INFO", **fields: Any) -> None:
    record = {"level": level, "event": event, "ts": int(time.time() * 1000)}
    record.update(_clean(fields))
    print(json.dumps(record, default=str))
