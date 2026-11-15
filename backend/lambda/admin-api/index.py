"""Staff identity and admin routes (orgs, cohorts). Cognito JWT authorizer in front."""
from boto3.dynamodb.conditions import Key

from admin_audit import ROUTES as AUDIT_ROUTES
from admin_cohorts import ROUTES as COHORT_ROUTES
from admin_keys import ROUTES as KEY_ROUTES
from admin_orgs import ROUTES as ORG_ROUTES
from admin_users import ROUTES as USER_ROUTES
from cic import db
from cic.authz import ADMIN, EXTERNAL, INSTRUCTOR, REVIEWER, require_staff
from cic.http import Request, make_handler

ROLE_PRIORITY = (ADMIN, INSTRUCTOR, EXTERNAL, REVIEWER)


def me(req: Request):
    staff = require_staff(req.auth)  # 401 without claims, 403 without a role
    role = next(r for r in ROLE_PRIORITY if r in staff.groups)
    claims = req.auth["jwt"]["claims"]
    table = db.get_table(db.CORE)

    profile = table.get_item(Key={"pk": f"USR#{staff.user_id}", "sk": "META"}).get("Item", {})
    # Admins always author. An instructor authors only when an admin has set canAuthor. External teachers and reviewers never write.
    can_author = role == ADMIN or (role == INSTRUCTOR and bool(profile.get("canAuthor", False)))

    classes = []
    if role in (INSTRUCTOR, EXTERNAL):
        for item in db.query_all(table, IndexName="gsi1",
                                 KeyConditionExpression=Key("gsi1pk").eq(f"USR#{staff.user_id}")):
            classes.append({"classId": item["gsi1sk"].split("#", 1)[1]})

    org_id, org_name = profile.get("orgId"), None
    if org_id:
        org = table.get_item(Key={"pk": f"ORG#{org_id}", "sk": "META"}).get("Item")
        org_name = org.get("name") if org else None
    return {
        "userId": staff.user_id,
        "role": role,
        "displayName": claims.get("name") or claims.get("email") or "",
        "permissions": {"canAuthor": can_author, "canEditAll": can_author},  # canEditAll is the old name, kept for the frontend
        "classes": classes,
        "orgId": org_id,  # the school an instructor's classes are created in
        "orgName": org_name,  # shown in the header; instructors cannot read the schools list
    }


lambda_handler = make_handler({"GET /v1/me": me, **ORG_ROUTES, **COHORT_ROUTES, **USER_ROUTES, **KEY_ROUTES, **AUDIT_ROUTES})
