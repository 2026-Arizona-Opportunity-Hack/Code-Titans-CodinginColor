"""Student identity: class code + secret words -> StudentPrincipal.

The rest of the API only sees the principal, so another provider (school SSO)
can be added later as a second implementation of authenticate().
"""
import hashlib
import hmac
from dataclasses import dataclass
from typing import Optional

from boto3.dynamodb.conditions import Key

from . import db, throttle
from .errors import InvalidCredentials, LoginThrottled, ValidationError
from .pepper import get_pepper
from .words import normalize_class_code, normalize_words


@dataclass(frozen=True)
class StudentPrincipal:
    student_id: str
    class_id: str
    display_name: str
    cred_version: int


def credential_hmac(class_id: str, words: str) -> str:
    return hmac.new(get_pepper(), f"{class_id}:{words}".encode("utf-8"), hashlib.sha256).hexdigest()


def find_class_by_code(class_code: str) -> Optional[dict]:
    result = db.get_table(db.CORE).query(
        IndexName="gsi3", KeyConditionExpression=Key("gsi3pk").eq(f"JOIN#{class_code}"), Limit=1)
    items = result.get("Items", [])
    return items[0] if items else None


def authenticate(class_code_raw, words_raw, now: Optional[int] = None) -> StudentPrincipal:
    if not isinstance(class_code_raw, str) or not class_code_raw:
        raise ValidationError("classCode is required")
    if not isinstance(words_raw, str) or not words_raw:
        raise ValidationError("studentCode is required")
    class_code = normalize_class_code(class_code_raw)
    words = normalize_words(words_raw)

    cls = find_class_by_code(class_code) if class_code else None
    class_id = cls["pk"].split("#", 1)[1] if cls else "none"
    if cls:
        wait = throttle.retry_after(class_id, now)
        if wait:
            raise LoginThrottled(wait)

    # Same HMAC work whether or not the class exists or the words are well formed.
    presented = credential_hmac(class_id, words or "invalid")
    roster = []
    if cls and cls.get("status", "active") == "active":
        roster = list(db.query_all(db.get_table(db.CORE), KeyConditionExpression=(
            Key("pk").eq(f"CLS#{class_id}") & Key("sk").begins_with("STU#"))))
    match = None
    for student in roster:  # no early exit, so timing does not reveal the match position
        if hmac.compare_digest(student.get("credHmac", ""), presented) and words \
                and student.get("status") == "active":
            match = student

    if match is None:
        if cls:
            throttle.record_failure(class_id, now)
        raise InvalidCredentials("Class code or student words are incorrect")
    return StudentPrincipal(
        student_id=match["sk"].split("#", 1)[1], class_id=class_id,
        display_name=match["displayName"], cred_version=int(match.get("credVersion", 1)))
