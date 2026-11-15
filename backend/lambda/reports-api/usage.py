"""GET /v1/admin/usage: how much external teachers use CIC's curriculum.

CIC runs this curriculum for its own classes and offers it to partner-school teachers who run
classes with their own rosters. CIC may see that those classes are used, and how much. It may not
see who the students are or how any of them is doing. So this report holds counts and dates only:
no student names or IDs, no scores, no join codes, and no per-student rows.
"""
from datetime import datetime, timezone
from boto3.dynamodb.conditions import Key
from cic import classdata, db, ids, keys
from cic.authz import require_admin
from cic.http import Reply, Request
ACTIVE_DAYS = 7
DAY_MS = 24 * 60 * 60 * 1000
def _iso(ms: int):
    if not ms:
        return None
    return datetime.fromtimestamp(ms / 1000, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
def _teachers(core, class_id: str) -> list:
    items = db.query_all(core, KeyConditionExpression=Key("pk").eq(keys.cls_pk(class_id)) & Key("sk").begins_with("INS#"))
    return sorted((i.get("name") or "Teacher" for i in items), key=str.lower)
def _roster(core, class_id: str) -> list:
    """IDs of the active students. They are used to count and are never returned."""
    items = db.query_all(core, KeyConditionExpression=Key("pk").eq(keys.cls_pk(class_id)) & Key("sk").begins_with(keys.ROSTER_PREFIX),
                         ProjectionExpression="sk, #s", ExpressionAttributeNames={"#s": "status"})
    return [i["sk"][len(keys.ROSTER_PREFIX):] for i in items if i.get("status", "active") == "active"]
def _activity(student_ids: list, since_ms: int):
    """(students active since `since_ms`, last activity in ms). Counts and a date only."""
    active, last = 0, 0
    for student_id in student_ids:
        seen = max((int(a.get("lastActiveAt", 0)) for a in classdata.student_activities(student_id).values()), default=0)
        last = max(last, seen)
        active += seen >= since_ms
    return active, last
def _modules_assigned(core, class_id: str) -> int:
    return core.query(KeyConditionExpression=Key("pk").eq(keys.cls_pk(class_id)) & Key("sk").begins_with(keys.ASSIGNMENT_PREFIX),
                      Select="COUNT")["Count"]
def usage(req: Request):
    require_admin(req.auth)
    core = db.get_table(db.CORE)
    since = ids.now_ms() - ACTIVE_DAYS * DAY_MS
    schools: dict = {}
    for meta in db.query_all(core, IndexName="gsi1", KeyConditionExpression=Key("gsi1pk").eq("LIST#XCLS")):
        class_id = meta["pk"][len("CLS#"):]
        roster = _roster(core, class_id)
        active, last = _activity(roster, since)
        school = schools.setdefault(meta["orgId"], {"classes": []})
        school["classes"].append({
            "name": meta["name"], "status": meta["status"], "createdAt": meta["createdAt"], "teachers": _teachers(core, class_id),
            "students": len(roster), "modulesAssigned": _modules_assigned(core, class_id),
            f"studentsActiveLast{ACTIVE_DAYS}Days": active, "lastActivityAt": _iso(last), "_last": last})
    rows = []
    for org_id, school in schools.items():
        org = core.get_item(Key={"pk": f"ORG#{org_id}", "sk": "META"}).get("Item") or {}
        classes = sorted(school["classes"], key=lambda c: c["name"].lower())
        last = max(c["_last"] for c in classes)
        for c in classes:
            del c["_last"]
        key = f"studentsActiveLast{ACTIVE_DAYS}Days"
        rows.append({"orgId": org_id, "name": org.get("name", org_id), "status": org.get("status", "active"),
                     "teachers": sorted({t for c in classes for t in c["teachers"]}, key=str.lower),
                     "classes": len(classes), "students": sum(c["students"] for c in classes),
                     key: sum(c[key] for c in classes), "lastActivityAt": _iso(last), "classList": classes})
    rows.sort(key=lambda r: r["name"].lower())
    key = f"studentsActiveLast{ACTIVE_DAYS}Days"
    totals = {"schools": len(rows), "classes": sum(r["classes"] for r in rows), "students": sum(r["students"] for r in rows),
              key: sum(r[key] for r in rows)}
    return Reply(data={"generatedAt": ids.utc_now_iso(), "activeWindowDays": ACTIVE_DAYS, "totals": totals, "schools": rows})
