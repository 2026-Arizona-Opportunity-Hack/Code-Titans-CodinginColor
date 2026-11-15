"""Staff identity and admin routes (orgs, cohorts). Cognito JWT authorizer in front."""
from boto3.dynamodb.conditions import Key

from admin_cohorts import ROUTES as COHORT_ROUTES
from admin_orgs import ROUTES as ORG_ROUTES
from cic import db
from cic.authz import ADMIN, INSTRUCTOR, REVIEWER, require_staff
from cic.http import Request, make_handler

ROLE_PRIORITY = (ADMIN, INSTRUCTOR, REVIEWER)


def me(req: Request):
    staff = require_staff(req.auth)  # 401 without claims, 403 without a role
    role = next(r for r in ROLE_PRIORITY if r in staff.groups)
    claims = req.auth["jwt"]["claims"]
    table = db.get_table(db.CORE)

    profile = table.get_item(Key={"pk": f"USR#{staff.user_id}", "sk": "META"}).get("Item", {})
    # Reviewers never write, whatever the flag says.
    can_author = role == ADMIN or (role == INSTRUCTOR and bool(profile.get("canAuthor", False)))

    classes = []
    if role == INSTRUCTOR:
        for item in db.query_all(table, IndexName="gsi1",
                                 KeyConditionExpression=Key("gsi1pk").eq(f"USR#{staff.user_id}")):
            classes.append({"classId": item["gsi1sk"].split("#", 1)[1]})

    return {
        "userId": staff.user_id,
        "role": role,
        "displayName": claims.get("name") or claims.get("email") or "",
        "permissions": {"canAuthor": can_author},
        "classes": classes,
    }


lambda_handler = make_handler({"GET /v1/me": me, **ORG_ROUTES, **COHORT_ROUTES})
