"""GET /v1/students?q=&cohortId=&classId= : find students by name across the caller's classes."""
from boto3.dynamodb.conditions import Key

from cic import db, paging, validate
from cic.authz import require_class_access, require_staff
from cic.errors import Forbidden
from cic.http import Reply, Request
from roster import load_roster, normalize_name


def _class_ids(staff, table, class_id, cohort_id) -> list:
    if class_id:
        return [class_id]
    if staff.is_admin:
        if cohort_id:
            items = db.query_all(table, IndexName="gsi2", KeyConditionExpression=Key("gsi2pk").eq(f"COH#{cohort_id}"))
        else:
            items = db.query_all(table, IndexName="gsi1", KeyConditionExpression=Key("gsi1pk").eq("LIST#CLS"))
        return [i["pk"].split("#", 1)[1] for i in items]
    ids = []
    for m in db.query_all(table, IndexName="gsi1", KeyConditionExpression=Key("gsi1pk").eq(f"USR#{staff.user_id}")):
        cid = m["gsi1sk"].split("#", 1)[1]
        meta = table.get_item(Key={"pk": f"CLS#{cid}", "sk": "META"}).get("Item", {})
        if not cohort_id or meta.get("cohortId") == cohort_id:
            ids.append(cid)
    return ids


def search(req: Request):
    staff = require_staff(req.auth)
    if not (staff.is_admin or staff.is_teacher):
        raise Forbidden("Only instructors, external teachers and administrators can search students")
    q = normalize_name(req.query.get("q", ""))
    limit = paging.parse_limit(req)
    class_id = validate.safe_id(req.query["classId"], "classId") if req.query.get("classId") else None
    cohort_id = validate.safe_id(req.query["cohortId"], "cohortId") if req.query.get("cohortId") else None
    table = db.get_table(db.CORE)
    if class_id:
        require_class_access(req.auth, table, class_id)  # instructors only for classes they belong to
    results = []
    for cid in _class_ids(staff, table, class_id, cohort_id):
        for item in load_roster(table, cid):
            if not q or q in normalize_name(item["displayName"]):
                results.append({"studentId": item["sk"].split("#", 1)[1], "displayName": item["displayName"],
                                "rosterNumber": int(item["rosterNumber"]), "classId": cid, "status": item["status"],
                                "gradeLevel": int(item["gradeLevel"]) if item.get("gradeLevel") is not None else None})
                if len(results) >= limit:
                    return Reply(data=results, meta={"nextCursor": None, "truncated": True})
    return Reply(data=results, meta={"nextCursor": None, "truncated": False})


ROUTES = {"GET /v1/students": search}
