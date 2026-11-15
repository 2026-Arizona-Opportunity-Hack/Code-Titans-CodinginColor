"""HTTP API Lambda authorizer (payload 2.0, simple response) for student routes.

API Gateway caches the result for 60 seconds per token, so a credential reset or
logout takes effect within a minute. Any error denies (fail closed).
"""
from cic import db, sessions
from cic.log import log

DENY = {"isAuthorized": False}


def lambda_handler(event, context):
    try:
        headers = {str(k).lower(): v for k, v in (event.get("headers") or {}).items()}
        scheme, _, token = (headers.get("authorization") or "").partition(" ")
        if scheme.lower() != "bearer" or not token:
            return DENY
        session = sessions.resolve_session(token)
        if session is None:
            return DENY
        roster = db.get_table(db.CORE).get_item(Key={
            "pk": f"CLS#{session['classId']}", "sk": f"STU#{session['studentId']}"}).get("Item")
        if (not roster or roster.get("status") != "active"
                or int(roster.get("credVersion", 1)) != int(session["credVersion"])):
            return DENY
        return {"isAuthorized": True,
                "context": {"studentId": session["studentId"], "classId": session["classId"]}}
    except Exception as err:  # noqa: BLE001 - fail closed
        log("authorizer_error", level="ERROR", errorType=type(err).__name__)
        return DENY
