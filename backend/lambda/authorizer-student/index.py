"""Lambda authorizer (HTTP API, payload v2, simple response) for student sessions.

The login endpoint stores sessions as core items: pk SES#<sha256(token)>, sk META,
with studentId, classId, credVersion and ttl. A session stops working when it
expires, when the student's credential is reset (credVersion changes), or when
the student is made inactive. API Gateway caches the answer for 60 seconds.
"""
import time

from cic import db, keys
from cic.log import log


def _deny():
    return {"isAuthorized": False}


def authorize(header_value, now=None):
    token = (header_value or "").removeprefix("Bearer ").strip()
    if not token.startswith("ses_") or len(token) > 200:
        return _deny()
    core = db.get_table(db.CORE)
    session = core.get_item(Key={"pk": keys.session_pk(keys.sha256_hex(token)), "sk": "META"}).get("Item")
    if not session or int(session.get("ttl", 0)) <= int(now or time.time()):
        return _deny()
    student_id, class_id = session["studentId"], session["classId"]
    student = core.get_item(Key={"pk": keys.stu_pk(student_id), "sk": "META"}).get("Item")
    if not student or student.get("classId") != class_id or int(student.get("credVersion", 0)) != int(session.get("credVersion", 0)):
        return _deny()
    roster = core.get_item(Key={"pk": keys.cls_pk(class_id), "sk": keys.roster_sk(student_id)}).get("Item")
    if not roster or roster.get("status", "active") != "active":
        return _deny()
    return {"isAuthorized": True, "context": {"studentId": student_id, "classId": class_id}}


def lambda_handler(event, context):
    try:
        return authorize((event.get("headers") or {}).get("authorization"))
    except Exception as e:  # fail closed
        log("authorizer_error", level="ERROR", errorType=type(e).__name__)
        return _deny()
