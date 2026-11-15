"""Staff users: GET/POST /v1/admin/users, PATCH /v1/admin/users/{userId}. Admin only.

Cognito holds identity (email, name, role as a group). The core table holds only
`USR#<sub>` with the `canAuthor` flag and the user's school (`orgId`), which is
where an instructor's classes are created. Roles are Cognito groups, so a role change
takes effect when the user's token is next refreshed (within the 1 hour token life).
"""
import os
import re

import boto3
from botocore.exceptions import ClientError

from cic import db, validate
from cic.authz import ADMIN, EXTERNAL, INSTRUCTOR, REVIEWER, require_admin
from cic.errors import Conflict, NotFound, ValidationError
from cic.http import Reply, Request
from cic.log import log

ROLES = (ADMIN, INSTRUCTOR, EXTERNAL, REVIEWER)
EMAIL = re.compile(r"^[^@\s]{1,64}@[^@\s]{1,189}$")
USER_ID = re.compile(r"^[A-Za-z0-9-]{8,64}$")
MAX_PAGE = 60  # Cognito ListUsers maximum
_client = None


def cognito():
    global _client
    if _client is None:
        _client = boto3.client("cognito-idp")
    return _client


def pool_id() -> str:
    return os.environ["USER_POOL_ID"]


def _attrs(user: dict) -> dict:
    return {a["Name"]: a["Value"] for a in user.get("Attributes") or user.get("UserAttributes") or []}


def _public(user: dict, role, can_author: bool, org_id=None) -> dict:
    a = _attrs(user)
    return {"userId": a["sub"], "email": a.get("email", ""), "name": a.get("name", ""),
            "role": role, "canAuthor": can_author, "enabled": user.get("Enabled", True),
            "status": user.get("UserStatus", ""), "orgId": org_id}


def _can_author(role, flag: bool) -> bool:
    """Admins always can. Reviewers never can. Instructors only with the flag."""
    return role == ADMIN or (role == INSTRUCTOR and flag)


def _profiles(sub_ids: list) -> dict:
    """{sub: USR#<sub> META item, or {} when there is none}."""
    table = db.get_table(db.CORE)
    return {sub: table.get_item(Key={"pk": f"USR#{sub}", "sk": "META"}).get("Item", {}) for sub in sub_ids}


def _school(body: dict):
    """orgId from a request body: an active school, None to clear it, or _MISSING if absent."""
    if "orgId" not in body:
        return _MISSING
    org_id = body["orgId"]
    if org_id is None:
        return None
    org_id = validate.safe_id(org_id, "orgId")
    org = db.get_table(db.CORE).get_item(Key={"pk": f"ORG#{org_id}", "sk": "META"}).get("Item")
    if not org or org.get("status") != "active":
        raise ValidationError("orgId does not match an active school")
    return org_id


_MISSING = object()


def check_school_for_role(role, org_id) -> None:
    """External teachers belong to an external school and everyone else to a CIC school, so an
    admin can never be given a way into an external school's classes by a wrong assignment."""
    if role == EXTERNAL and not org_id:
        raise ValidationError("External teachers need an external school (orgId)")
    if not org_id:
        return
    org = db.get_table(db.CORE).get_item(Key={"pk": f"ORG#{org_id}", "sk": "META"}).get("Item") or {}
    external_school = org.get("kind", "cic") == "external"
    if external_school and role != EXTERNAL:
        raise ValidationError("An external school can only have external teachers")
    if role == EXTERNAL and not external_school:
        raise ValidationError("External teachers must belong to an external school")


def _roles_by_sub() -> dict:
    roles = {}
    for role in ROLES:
        token = None
        while True:
            kwargs = {"UserPoolId": pool_id(), "GroupName": role}
            if token:
                kwargs["NextToken"] = token
            page = cognito().list_users_in_group(**kwargs)
            for user in page["Users"]:
                roles[_attrs(user)["sub"]] = role
            token = page.get("NextToken")
            if not token:
                break
    return roles


def list_users(req: Request):
    require_admin(req.auth)
    raw = req.query.get("limit", "50")
    if not raw.isdigit() or not 1 <= int(raw) <= MAX_PAGE:
        raise ValidationError(f"limit must be a number from 1 to {MAX_PAGE}")
    kwargs = {"UserPoolId": pool_id(), "Limit": int(raw)}
    cursor = req.query.get("cursor")
    if cursor:
        if len(cursor) > 2048:
            raise ValidationError("cursor is not valid")
        kwargs["PaginationToken"] = cursor
    try:
        page = cognito().list_users(**kwargs)
    except ClientError as err:
        if err.response["Error"]["Code"] == "InvalidParameterException":
            raise ValidationError("cursor is not valid")
        raise
    users = page["Users"]
    roles = _roles_by_sub()
    profiles = _profiles([_attrs(u)["sub"] for u in users])
    data = []
    for u in users:
        sub = _attrs(u)["sub"]
        role = roles.get(sub)
        profile = profiles[sub]
        data.append(_public(u, role, _can_author(role, bool(profile.get("canAuthor", False))), profile.get("orgId")))
    return Reply(data=data, meta={"nextCursor": page.get("PaginationToken")})


def invite_user(admin_id: str, email: str, name: str, role: str, can_author: bool, org_id):
    """Create the Cognito user (which sends the invite email), add the role group and write the
    profile. Returns (cognito user, sub). Nothing is left behind if a step fails."""
    check_school_for_role(role, org_id)
    try:
        created = cognito().admin_create_user(
            UserPoolId=pool_id(), Username=email, DesiredDeliveryMediums=["EMAIL"],
            UserAttributes=[{"Name": "email", "Value": email}, {"Name": "email_verified", "Value": "true"},
                            {"Name": "name", "Value": name}])["User"]
    except ClientError as err:
        if err.response["Error"]["Code"] == "UsernameExistsException":
            raise Conflict("A user with this email already exists")
        raise
    sub = _attrs(created)["sub"]
    try:
        cognito().admin_add_user_to_group(UserPoolId=pool_id(), Username=email, GroupName=role)
        profile = {"pk": f"USR#{sub}", "sk": "META", "canAuthor": can_author}
        if org_id:
            profile["orgId"] = org_id
        db.get_table(db.CORE).put_item(Item=profile)
    except Exception:
        cognito().admin_delete_user(UserPoolId=pool_id(), Username=email)  # no half-created users
        raise
    log("staff_user_invited", userId=sub, role=role, by=admin_id)
    return created, sub
def create_user(req: Request):
    admin = require_admin(req.auth)
    body = req.json()
    validate.reject_unknown(body, ("email", "name", "role", "canAuthor", "orgId"))
    email = (validate.text(body, "email", 254) or "").lower()
    if not EMAIL.match(email):
        raise ValidationError("email is not valid")
    name = validate.text(body, "name")
    role = validate.choice(body, "role", ROLES)
    if role is None:
        raise ValidationError("role is required")
    flag = body.get("canAuthor", False)
    if not isinstance(flag, bool):
        raise ValidationError("canAuthor must be true or false")
    if flag and role != INSTRUCTOR:
        raise ValidationError("canAuthor can only be set for instructors")
    org_id = _school(body)
    org_id = None if org_id is _MISSING else org_id
    created, _ = invite_user(admin.user_id, email, name, role, flag, org_id)
    return Reply(data=_public(created, role, _can_author(role, flag), org_id), status=201)
def _current_role(sub: str):
    groups = cognito().admin_list_groups_for_user(UserPoolId=pool_id(), Username=sub)["Groups"]
    names = [g["GroupName"] for g in groups]
    return next((r for r in ROLES if r in names), None)


def update_user(req: Request):
    admin = require_admin(req.auth)
    sub = req.path.get("userId", "")
    if not USER_ID.match(sub):
        raise NotFound("User not found")
    body = req.json()
    validate.reject_unknown(body, ("role", "canAuthor", "enabled", "orgId"))
    role = validate.choice(body, "role", ROLES)
    flag = body.get("canAuthor")
    enabled = body.get("enabled")
    for field, value in (("canAuthor", flag), ("enabled", enabled)):
        if value is not None and not isinstance(value, bool):
            raise ValidationError(f"{field} must be true or false")
    org_id = _school(body)
    if role is None and flag is None and enabled is None and org_id is _MISSING:
        raise ValidationError("Nothing to update")
    if sub == admin.user_id and (enabled is False or (role and role != ADMIN)):
        raise ValidationError("You cannot demote or disable your own account")

    try:
        user = cognito().admin_get_user(UserPoolId=pool_id(), Username=sub)
    except ClientError as err:
        if err.response["Error"]["Code"] == "UserNotFoundException":
            raise NotFound("User not found")
        raise
    old_role = _current_role(sub)
    new_role = role or old_role
    table = db.get_table(db.CORE)
    key = {"pk": f"USR#{sub}", "sk": "META"}
    profile = table.get_item(Key=key).get("Item", {})
    stored = bool(profile.get("canAuthor", False))
    new_org = profile.get("orgId") if org_id is _MISSING else org_id
    new_flag = stored if flag is None else flag
    if new_flag and new_role != INSTRUCTOR:
        if flag:  # explicitly asked for something that cannot apply
            raise ValidationError("canAuthor can only be set for instructors")
        new_flag = False  # a role change away from instructor clears it

    check_school_for_role(new_role, new_org)
    if role and role != old_role:
        cognito().admin_add_user_to_group(UserPoolId=pool_id(), Username=sub, GroupName=role)
        if old_role:
            cognito().admin_remove_user_from_group(UserPoolId=pool_id(), Username=sub, GroupName=old_role)
    if new_flag != stored or new_org != profile.get("orgId"):
        item = {**key, "canAuthor": new_flag}
        if new_org:
            item["orgId"] = new_org
        table.put_item(Item=item)
    if enabled is False:
        cognito().admin_disable_user(UserPoolId=pool_id(), Username=sub)
        cognito().admin_user_global_sign_out(UserPoolId=pool_id(), Username=sub)  # end live sessions
    elif enabled is True:
        cognito().admin_enable_user(UserPoolId=pool_id(), Username=sub)
    log("staff_user_updated", userId=sub, by=admin.user_id)
    user = cognito().admin_get_user(UserPoolId=pool_id(), Username=sub)
    return _public(user, new_role, _can_author(new_role, new_flag), new_org)


ROUTES = {
    "GET /v1/admin/users": list_users,
    "POST /v1/admin/users": create_user,
    "PATCH /v1/admin/users/{userId}": update_user,
}
