"""Student player API (api.md section 6). Callers are authenticated by authorizer-student.

studentId and classId always come from the verified session, never from the request.
"""
import re

import student_service as svc
from cic import db, grading, keys
from cic.authz import student_from_auth
from cic.errors import Conflict, Forbidden, ValidationError
from cic.http import make_handler
from cic.ids import now_ms
from cic.progress import COMPLETE, IN_PROGRESS, is_module_complete, next_activity

CSID = re.compile(r"^[A-Za-z0-9_-]{8,64}$")
MAX_HEARTBEAT_CREDIT = 45  # seconds credited per heartbeat
QUESTION_TYPES = ("check", "exit", "assessment")


def _ids(req):
    return keys.safe_id(req.path.get("moduleId"), "moduleId"), keys.safe_id(req.path.get("activityId"), "activityId")


def home(req):
    ctx = svc.load_ctx(student_from_auth(req.auth))
    views, resume = ctx.views()
    modules = [{k: v[k] for k in ("moduleId", "title", "state", "percent")} for v in views]
    return {"student": {"displayName": ctx.roster.get("displayName"), "classId": ctx.student.class_id}, "modules": modules, "resume": resume}


def get_module(req):
    module_id = keys.safe_id(req.path.get("moduleId"), "moduleId")
    ctx = svc.load_ctx(student_from_auth(req.auth))
    module = ctx.module(module_id)
    views, _ = ctx.views()
    view = next(v for v in views if v["moduleId"] == module_id)
    if view["state"] == "locked":
        raise Forbidden("Finish the previous module first", code="MODULE_LOCKED")
    version = next(int(a["moduleVersion"]) for a in ctx.assignments if a["moduleId"] == module_id)
    doc = svc.sanitize_module(module, view["activities"], ctx.act_items, version)
    doc["state"], doc["percent"] = view["state"], view["percent"]
    return doc


def save_draft(req):
    module_id, activity_id = _ids(req)
    student = student_from_auth(req.auth)
    ctx = svc.load_ctx(student)
    activity = svc.find_activity(ctx.module(module_id), activity_id)
    if activity.get("type") != "worksheet":
        raise ValidationError("Drafts are only saved for worksheets")
    svc.assert_open(ctx, module_id, activity_id)
    fields = {f["fieldId"] for f in activity.get("fields", [])}
    answers = grading.parse_answers(req.json().get("answers"), fields)
    db.get_table(db.PROGRESS).update_item(
        Key={"pk": keys.stu_pk(student.student_id), "sk": keys.activity_sk(module_id, activity_id)},
        UpdateExpression="SET draft = :d, classId = :c, lastActiveAt = :n, startedAt = if_not_exists(startedAt, :n), #st = if_not_exists(#st, :ip)",
        ExpressionAttributeNames={"#st": "status"},
        ExpressionAttributeValues={":d": db.to_dynamo(answers), ":c": student.class_id, ":n": now_ms(), ":ip": IN_PROGRESS},
    )
    return {"savedAt": now_ms()}


def heartbeat(req):
    module_id, activity_id = _ids(req)
    student = student_from_auth(req.auth)
    seconds = req.json().get("seconds")
    if not isinstance(seconds, int) or isinstance(seconds, bool) or seconds < 1 or seconds > 120:
        raise ValidationError("seconds must be a whole number from 1 to 120")
    credit = min(seconds, MAX_HEARTBEAT_CREDIT)
    db.get_table(db.PROGRESS).update_item(
        Key={"pk": keys.stu_pk(student.student_id), "sk": keys.activity_sk(module_id, activity_id)},
        UpdateExpression="ADD activeSeconds :s SET classId = :c, lastActiveAt = :n, startedAt = if_not_exists(startedAt, :n), #st = if_not_exists(#st, :ip)",
        ExpressionAttributeNames={"#st": "status"},
        ExpressionAttributeValues={":s": credit, ":c": student.class_id, ":n": now_ms(), ":ip": IN_PROGRESS},
    )
    return {"credited": credit}


def complete_activity(req):
    module_id, activity_id = _ids(req)
    ctx = svc.load_ctx(student_from_auth(req.auth))
    activity = svc.find_activity(ctx.module(module_id), activity_id)
    if activity.get("type") not in ("video", "slides"):
        raise ValidationError("Only video and slides are marked done this way")
    svc.assert_open(ctx, module_id, activity_id)
    spent = int((ctx.act_items.get((module_id, activity_id)) or {}).get("activeSeconds", 0))
    if spent < int(activity.get("minSeconds", 0)):
        raise Conflict("Keep watching before marking this done", code="TOO_EARLY")
    return _commit(ctx, module_id, activity_id, COMPLETE, {})


def submit(req):
    module_id, activity_id = _ids(req)
    body = req.json()
    csid = body.get("clientSubmissionId")
    if not isinstance(csid, str) or not CSID.match(csid):
        raise ValidationError("clientSubmissionId must be 8 to 64 letters, digits, - or _")
    ctx = svc.load_ctx(student_from_auth(req.auth))
    module = ctx.module(module_id)
    activity = svc.find_activity(module, activity_id)
    svc.assert_open(ctx, module_id, activity_id)

    prior = ctx.act_items.get((module_id, activity_id)) or {}
    if prior.get("lastClientSubmissionId") == csid and prior.get("lastResult"):
        return {"moduleUnlocked": None, **prior["lastResult"]}  # safe retry after a dropped connection

    kind = activity.get("type")
    if kind == "worksheet":
        status, payload = _submit_worksheet(ctx, module_id, activity, body.get("answers"))
    elif kind in QUESTION_TYPES:
        status, payload = _submit_questions(ctx, module_id, activity, kind, body.get("answers"))
    else:
        raise ValidationError("This activity type is not submitted with answers")
    return _commit(ctx, module_id, activity_id, status, payload, csid)


def _submit_questions(ctx, module_id, activity, kind, raw):
    questions = activity.get("questions", [])
    answers = grading.parse_answers(raw, {q["questionId"] for q in questions})
    graded = grading.grade(questions, answers)
    if kind == "assessment":
        created = _record_assessment(ctx, module_id, activity, answers, graded)
        already_done = ctx.statuses.get((module_id, activity["activityId"])) == COMPLETE
        if not created and already_done:
            raise Forbidden("This test was already submitted", code="ASSESSMENT_ALREADY_SUBMITTED")
        return COMPLETE, {"recorded": True}  # no scores or answers are revealed for tests
    pass_pct = activity.get("passPct")
    passed = pass_pct is None or graded.pct >= float(pass_pct)
    payload = {"_score": graded.pct, "recorded": True}
    if kind == "check":
        payload.update(scorePct=graded.pct, passed=passed, results=graded.results)
    return (COMPLETE if passed else IN_PROGRESS), payload


def _record_assessment(ctx, module_id, activity, answers, graded):
    role = activity.get("role")
    sk = keys.assessment_sk(module_id, role)
    item = {
        "pk": keys.stu_pk(ctx.student.student_id), "sk": sk, "classId": ctx.student.class_id,
        "cohortId": ctx.class_meta.get("cohortId", "none"), "moduleId": module_id, "role": role,
        "scorePct": graded.pct, "byConcept": graded.by_concept, "answers": answers, "submittedAt": now_ms(),
        "gsi1pk": keys.gsi_class_assessments(ctx.student.class_id, module_id), "gsi1sk": f"{role}#{ctx.student.student_id}",
    }
    table = db.get_table(db.PROGRESS)
    try:
        table.put_item(Item=db.to_dynamo(item), ConditionExpression="attribute_not_exists(pk)")
        return True
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        return False  # the first answers are kept; a half-finished earlier attempt is completed by the caller


def _submit_worksheet(ctx, module_id, activity, raw):
    fields = activity.get("fields", [])
    answers = grading.parse_answers(raw, {f["fieldId"] for f in fields})
    keyed = [{"questionId": f["fieldId"], "type": f.get("type", "short"), "answerKey": f["answerKey"], "points": f.get("points", 1)}
             for f in fields if f.get("answerKey") is not None]
    manual = len(keyed) < len(fields)
    graded = grading.grade(keyed, answers) if keyed else None
    ts = now_ms()
    item = {"pk": keys.stu_pk(ctx.student.student_id), "sk": keys.submission_sk(activity["activityId"], ts), "classId": ctx.student.class_id,
            "moduleId": module_id, "activityId": activity["activityId"], "answers": answers, "submittedAt": ts,
            "autoScorePct": graded.pct if graded else None, "reviewStatus": "pending" if manual else "auto"}
    if manual:
        item.update(gsi2pk=keys.gsi_class_review(ctx.student.class_id), gsi2sk=f"{ts:013d}#{ctx.student.student_id}")
    db.get_table(db.PROGRESS).put_item(Item=db.to_dynamo(item))
    return COMPLETE, {"recorded": True, "autoScorePct": graded.pct if graded else None, "pendingReview": manual}


def _commit(ctx, module_id, activity_id, status, payload, csid=None):
    """Compute the response (including the next step), save it with the activity, and update module state."""
    score = payload.pop("_score", None)
    current = ctx.statuses.get((module_id, activity_id))
    new_status = COMPLETE if current == COMPLETE else status
    after = {**ctx.statuses, (module_id, activity_id): new_status}
    module = ctx.modules[module_id]
    nxt = next_activity(module, after)
    done = is_module_complete(module, after)
    unlocked = None
    if done:
        idx = ctx.order.index(module_id)
        unlocked = ctx.order[idx + 1] if idx + 1 < len(ctx.order) else None
    result = {**payload, "activityState": new_status,
              "next": {"type": "activity", "activityId": nxt} if nxt else {"type": "module_complete"}, "moduleUnlocked": unlocked}
    svc.save_activity(ctx, module_id, activity_id, new_status, csid, result, score)
    svc.sync_module_state(ctx, module_id, done)
    return result


ROUTES = {
    "GET /v1/student/home": home,
    "GET /v1/student/modules/{moduleId}": get_module,
    "PUT /v1/student/modules/{moduleId}/activities/{activityId}/draft": save_draft,
    "POST /v1/student/modules/{moduleId}/activities/{activityId}/heartbeat": heartbeat,
    "POST /v1/student/modules/{moduleId}/activities/{activityId}/submit": submit,
    "POST /v1/student/modules/{moduleId}/activities/{activityId}/complete": complete_activity,
}

lambda_handler = make_handler(ROUTES)
