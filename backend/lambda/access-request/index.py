"""POST /v1/auth/external/request-access (public): a teacher outside CIC asks for an account.

Nothing here creates a user. An admin reviews the request and, on approval, invites the person
through the staff user pool, which stays invite-only. The answer is the same whether or not the
email already has a request, so this route cannot be used to find out who has asked.
The route is throttled at the gateway, and a cap on pending requests bounds what a flood can store.
"""
import re
from cic import access_requests, validate
from cic.errors import ValidationError
from cic.http import Reply, make_handler
from cic.log import log
EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,189}$")
def request_access(req):
    body = req.json()
    validate.reject_unknown(body, ("name", "email", "organization", "note"))
    name = validate.text(body, "name")
    organization = validate.text(body, "organization", 120)
    email = (validate.text(body, "email", 254) or "").lower()
    if not EMAIL.match(email):
        raise ValidationError("email is not valid")
    note = validate.text(body, "note", 500, required=False)
    request_id = access_requests.create(name, email, organization, note)
    log("access_requested", requestId=request_id, duplicate=request_id is None)
    return Reply(data={"received": True}, status=202)
ROUTES = {"POST /v1/auth/external/request-access": request_access}
lambda_handler = make_handler(ROUTES)
