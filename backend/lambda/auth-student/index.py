"""POST /v1/auth/student/login (public) and POST /v1/auth/student/logout (student session)."""
import datetime

from cic import identity, sessions
from cic.authz import student_from_auth
from cic.errors import Unauthenticated
from cic.http import Reply, Request, make_handler
from cic.log import log


def _iso(epoch: int) -> str:
    return datetime.datetime.fromtimestamp(epoch, datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def login(req: Request):
    body = req.json()
    principal = identity.authenticate(body.get("classCode"), body.get("studentCode"))
    token, expires = sessions.create_session(
        principal.student_id, principal.class_id, principal.cred_version)
    log("student_login", studentId=principal.student_id, classId=principal.class_id)
    return {
        "sessionToken": token,
        "expiresAt": _iso(expires),
        "student": {"displayName": principal.display_name, "classId": principal.class_id},
    }


def logout(req: Request):
    student_from_auth(req.auth)  # the authorizer already verified the session
    scheme, _, token = (req.headers.get("authorization") or "").partition(" ")
    if scheme.lower() != "bearer" or not token:
        raise Unauthenticated("Sign in required")
    sessions.delete_session(token)
    return Reply(data={"signedOut": True})


lambda_handler = make_handler({
    "POST /v1/auth/student/login": login,
    "POST /v1/auth/student/logout": logout,
})
