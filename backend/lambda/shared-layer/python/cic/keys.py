"""DynamoDB key builders. This module is the single source of truth for key shapes
described in docs/architecture.md section 6. Always build keys here, never inline.

IDs that come from URLs or request bodies must pass safe_id() first, so a caller
cannot smuggle "#" into a key and read another entity's items.
"""
import hashlib
import re

from .errors import ValidationError

_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")

ROLES = ("pre", "post")


def safe_id(value: str, label: str = "id") -> str:
    if not isinstance(value, str) or not _SAFE_ID.match(value):
        raise ValidationError(f"Invalid {label}")
    return value


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


# ---- core table ----
def cls_pk(class_id: str) -> str:
    return f"CLS#{class_id}"


def stu_pk(student_id: str) -> str:
    return f"STU#{student_id}"


def coh_pk(cohort_id: str) -> str:
    return f"COH#{cohort_id}"


def key_pk(key_id: str) -> str:
    return f"KEY#{key_id}"


def session_pk(token_hash: str) -> str:
    return f"SES#{token_hash}"


ROSTER_PREFIX = "STU#"
ASSIGNMENT_PREFIX = "ASG#"


def roster_sk(student_id: str) -> str:
    return f"STU#{student_id}"


def assignment_sk(order: int, module_id: str) -> str:
    return f"ASG#{order:04d}#{module_id}"


def override_sk(student_id: str, module_id: str) -> str:
    return f"OVR#{student_id}#{module_id}"


# ---- content table ----
def module_pk(module_id: str) -> str:
    return f"MOD#{module_id}"


def version_sk(version: int) -> str:
    return f"V#{version:04d}"


# ---- progress table ----
def activity_sk(module_id: str, activity_id: str) -> str:
    return f"ACT#{module_id}#{activity_id}"


def module_state_sk(module_id: str) -> str:
    return f"MOD#{module_id}"


def assessment_sk(module_id: str, role: str) -> str:
    if role not in ROLES:
        raise ValidationError("Invalid assessment role")
    return f"ASM#{module_id}#{role}"


def submission_sk(activity_id: str, ts_ms: int) -> str:
    return f"SUB#{activity_id}#{ts_ms:013d}"


def gsi_class_module(class_id: str, module_id: str) -> str:
    return f"CLS#{class_id}#MOD#{module_id}"


def gsi_class_assessments(class_id: str, module_id: str) -> str:
    return f"CLS#{class_id}#ASM#{module_id}"


def gsi_class_review(class_id: str) -> str:
    return f"CLS#{class_id}#REVIEW"


def encode_submission_id(student_id: str, activity_id: str, ts_ms: int) -> str:
    return f"{student_id}:{activity_id}:{ts_ms}"


def decode_submission_id(submission_id: str):
    """Return (student_id, activity_id, ts_ms) or raise ValidationError."""
    parts = submission_id.split(":") if isinstance(submission_id, str) else []
    if len(parts) != 3 or not parts[2].isdigit():
        raise ValidationError("Invalid submission id")
    return safe_id(parts[0], "studentId"), safe_id(parts[1], "activityId"), int(parts[2])
