"""Identity and authorization helpers.

Authorization is always enforced here, in the Lambda, using identity that an
authorizer already verified. Never trust IDs from the request body or path for
who the caller is.

Staff:   API Gateway's Cognito JWT authorizer verified the token. We read claims.
Student: our Lambda authorizer resolved the session. We read its context.
"""
from dataclasses import dataclass
from typing import Any, Optional

from .errors import Forbidden, NotFound, Unauthenticated

ADMIN = "cic_admin"
INSTRUCTOR = "instructor"
REVIEWER = "reviewer"


@dataclass(frozen=True)
class Staff:
    user_id: str
    groups: frozenset

    @property
    def is_admin(self) -> bool:
        return ADMIN in self.groups

    @property
    def is_instructor(self) -> bool:
        return INSTRUCTOR in self.groups

    @property
    def is_reviewer(self) -> bool:
        return REVIEWER in self.groups


@dataclass(frozen=True)
class Student:
    student_id: str
    class_id: str


@dataclass(frozen=True)
class ApiKey:
    key_id: str
    scopes: frozenset


def _parse_groups(raw: Any) -> frozenset:
    """API Gateway passes array claims as a string like "[cic_admin instructor]"."""
    if raw is None:
        return frozenset()
    if isinstance(raw, (list, tuple, set)):
        return frozenset(str(g) for g in raw)
    text = str(raw).strip().strip("[]")
    parts = text.replace(",", " ").split()
    return frozenset(p.strip("\"'") for p in parts if p)


def staff_from_auth(auth: dict) -> Staff:
    claims = ((auth or {}).get("jwt") or {}).get("claims") or {}
    sub = claims.get("sub")
    if not sub:
        raise Unauthenticated("Sign in required")
    return Staff(user_id=str(sub), groups=_parse_groups(claims.get("cognito:groups")))


def student_from_auth(auth: dict) -> Student:
    ctx = (auth or {}).get("lambda") or {}
    student_id, class_id = ctx.get("studentId"), ctx.get("classId")
    if not student_id or not class_id:
        raise Unauthenticated("Sign in required")
    return Student(student_id=str(student_id), class_id=str(class_id))


def api_key_from_auth(auth: dict, required_scope: Optional[str] = None) -> ApiKey:
    ctx = (auth or {}).get("lambda") or {}
    key_id = ctx.get("keyId")
    if not key_id:
        raise Unauthenticated("A valid API key is required")
    raw_scopes = ctx.get("scopes", "")
    scopes = frozenset(raw_scopes if isinstance(raw_scopes, list) else str(raw_scopes).split(","))
    if required_scope and required_scope not in scopes:
        raise Forbidden("This API key does not have the required scope")
    return ApiKey(key_id=str(key_id), scopes=scopes)


def require_staff(auth: dict) -> Staff:
    """Any signed-in staff user (admin, instructor, or reviewer)."""
    staff = staff_from_auth(auth)
    if not (staff.is_admin or staff.is_instructor or staff.is_reviewer):
        raise Forbidden("Your account has no role assigned")
    return staff


def require_admin(auth: dict) -> Staff:
    staff = staff_from_auth(auth)
    if not staff.is_admin:
        raise Forbidden("Administrator access required")
    return staff


def require_class_access(auth: dict, core_table: Any, class_id: str) -> Staff:
    """Allow admins for any class, and instructors only for classes they belong to.

    Reviewers are always refused: they never see class or student data.
    A class that does not exist returns 404 to admins, and 403 to others, so an
    instructor cannot probe which class IDs exist.
    """
    staff = staff_from_auth(auth)
    if staff.is_admin:
        meta = core_table.get_item(Key={"pk": f"CLS#{class_id}", "sk": "META"}).get("Item")
        if not meta:
            raise NotFound("Class not found")
        return staff
    if staff.is_instructor:
        member = core_table.get_item(Key={"pk": f"CLS#{class_id}", "sk": f"INS#{staff.user_id}"}).get("Item")
        if member:
            return staff
    raise Forbidden("You do not have access to this class")
