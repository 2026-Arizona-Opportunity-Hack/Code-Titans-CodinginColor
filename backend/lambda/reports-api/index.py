"""Instructor reports (api.md section 5) and the admin cohort summary.

Every class route authorizes with require_class_access: admins for any class, instructors
only for classes they belong to, and reviewers never.
"""
import base64
import json

import reports_service as svc
from cic import audit, classdata, db, gain, keys, summaries
from cic.authz import require_admin, require_class_access
from cic.classdata import ClassData
from cic.csvutil import to_csv
from cic.errors import NotFound, ValidationError
from cic.http import Reply, make_handler
from cic.ids import now_ms
from cic.log import log

MAX_COMMENT = 1000


def _class(req):
    class_id = keys.safe_id(req.path.get("classId"), "classId")
    staff = require_class_access(req.auth, db.get_table(db.CORE), class_id)
    return staff, classdata.load_class(class_id)


def progress(req):
    _, data = _class(req)
    return svc.progress_matrix(data)


def student_progress(req):
    _, data = _class(req)
    roster_item = svc.find_roster(data, keys.safe_id(req.path.get("studentId"), "studentId"))
    return svc.student_detail(data, roster_item)


def attention(req):
    _, data = _class(req)
    return svc.attention(data, now_ms())


def _assigned(data: ClassData, module_id: str) -> str:
    if module_id not in data.modules:
        raise NotFound("Module is not assigned to this class")
    return module_id


def _gain_rows(data: ClassData, module_id: str) -> dict:
    active = {ClassData.student_id(r): r for r in data.active_roster}
    assess = {sid: p for sid, p in classdata.class_assessments(data.class_id, module_id).items() if sid in active}
    result = gain.module_gain(assess, len(active))
    seen = {row["studentId"] for row in result["students"]}
    for sid in active:  # students with no test yet still appear
        if sid not in seen:
            result["students"].append({"studentId": sid, "pre": None, "post": None, "gain": None, "normalizedGain": None})
    for row in result["students"]:
        row.update({k: v for k, v in svc.student_row(active[row["studentId"]]).items() if k != "studentId"})
    result["students"].sort(key=lambda r: (r.get("rosterNumber") or 0, r.get("displayName") or ""))
    return result


def module_gain(req):
    _, data = _class(req)
    module_id = _assigned(data, keys.safe_id(req.path.get("moduleId"), "moduleId"))
    return {"definitions": gain.DEFINITIONS, "moduleId": module_id, **_gain_rows(data, module_id)}


def concepts(req):
    _, data = _class(req)
    return {"definitions": gain.DEFINITIONS, "concepts": summaries.concept_gain([data.class_id])}


def _cursor_in(raw):
    if not raw:
        return None
    try:
        return json.loads(base64.urlsafe_b64decode(raw.encode()))
    except Exception:
        raise ValidationError("Invalid cursor")


def review_queue(req):
    _, data = _class(req)
    try:
        limit = min(max(int(req.query.get("limit", 50)), 1), 200)
    except ValueError:
        raise ValidationError("limit must be a number")
    kwargs = {"IndexName": "gsi2", "KeyConditionExpression": "gsi2pk = :p", "ExpressionAttributeValues": {":p": keys.gsi_class_review(data.class_id)}, "Limit": limit}
    start = _cursor_in(req.query.get("cursor"))
    if start:
        kwargs["ExclusiveStartKey"] = start
    resp = db.get_table(db.PROGRESS).query(**kwargs)
    names = {ClassData.student_id(r): svc.student_row(r) for r in data.roster}
    items = []
    for i in resp["Items"]:
        sid = i["pk"][len("STU#"):]
        ts = int(i["sk"].rsplit("#", 1)[1])
        items.append({"submissionId": keys.encode_submission_id(sid, i["activityId"], ts), "student": names.get(sid), "moduleId": i["moduleId"],
                      "activityId": i["activityId"], "submittedAt": i["submittedAt"], "answers": i["answers"], "autoScorePct": i.get("autoScorePct")})
    last = resp.get("LastEvaluatedKey")
    cursor = base64.urlsafe_b64encode(json.dumps(last).encode()).decode() if last else None
    return Reply(items, meta={"nextCursor": cursor})


def review_submission(req):
    staff, data = _class(req)
    student_id, activity_id, ts = keys.decode_submission_id(req.path.get("submissionId"))
    body = req.json()
    score, comment = body.get("score"), body.get("comment", "")
    if isinstance(score, bool) or not isinstance(score, (int, float)) or not 0 <= score <= 100:
        raise ValidationError("score must be a number from 0 to 100")
    if not isinstance(comment, str) or len(comment) > MAX_COMMENT:
        raise ValidationError("comment must be text up to 1000 characters")
    table = db.get_table(db.PROGRESS)
    try:
        table.update_item(
            Key={"pk": keys.stu_pk(student_id), "sk": keys.submission_sk(activity_id, ts)},
            UpdateExpression="SET reviewStatus = :r, reviewScore = :s, reviewComment = :c, reviewedBy = :u, reviewedAt = :n REMOVE gsi2pk, gsi2sk",
            ConditionExpression="attribute_exists(pk) AND classId = :cls",
            ExpressionAttributeValues={":r": "reviewed", ":s": db.to_dynamo(score), ":c": comment, ":u": staff.user_id, ":n": now_ms(), ":cls": data.class_id},
        )
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        raise NotFound("Submission not found in this class")
    return {"submissionId": req.path["submissionId"], "reviewStatus": "reviewed"}


def export(req):
    staff, data = _class(req)
    kind = req.query.get("type", "gain")
    if kind == "gain":
        header = ["module", "rosterNumber", "student", "pre", "post", "gain", "normalizedGain"]
        rows = []
        for module_id in data.order:
            title = data.modules[module_id].get("title")
            for s in _gain_rows(data, module_id)["students"]:
                rows.append([title, s.get("rosterNumber"), s.get("displayName"), s["pre"], s["post"], s["gain"], s["normalizedGain"]])
    elif kind == "progress":
        matrix = svc.progress_matrix(data)
        header = ["rosterNumber", "student"] + [f"{m['title']} percent" for m in matrix["modules"]] + [f"{m['title']} minutes" for m in matrix["modules"]]
        rows = [[s["rosterNumber"], s["displayName"]] + [s["modules"][m["moduleId"]]["percent"] for m in matrix["modules"]]
                + [s["modules"][m["moduleId"]]["activeMinutes"] for m in matrix["modules"]] for s in matrix["students"]]
    else:
        raise ValidationError("type must be gain or progress")
    audit.record(staff.user_id, "export", {"classId": data.class_id, "type": kind})
    log("export", classId=data.class_id, type=kind, rows=len(rows))
    return Reply(raw=to_csv(header, rows), content_type="text/csv; charset=utf-8",
                 headers={"Content-Disposition": f'attachment; filename="{kind}-{data.class_id}.csv"'})


def cohort_summary(req):
    require_admin(req.auth)
    return summaries.cohort_summary(keys.safe_id(req.path.get("cohortId"), "cohortId"))


ROUTES = {
    "GET /v1/classes/{classId}/progress": progress,
    "GET /v1/classes/{classId}/students/{studentId}/progress": student_progress,
    "GET /v1/classes/{classId}/attention": attention,
    "GET /v1/classes/{classId}/modules/{moduleId}/gain": module_gain,
    "GET /v1/classes/{classId}/concepts": concepts,
    "GET /v1/classes/{classId}/review-queue": review_queue,
    "PUT /v1/classes/{classId}/submissions/{submissionId}/review": review_submission,
    "GET /v1/classes/{classId}/export": export,
    "GET /v1/admin/cohorts/{cohortId}/summary": cohort_summary,
}

lambda_handler = make_handler(ROUTES)
