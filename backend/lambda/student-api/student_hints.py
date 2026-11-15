"""POST /v1/student/hints: one Socratic hint from Bedrock, with limits and a teacher-reviewable log.

Safety rules, in the order they apply:
- Only check and worksheet activities. Never tests: a hint on a pretest or post-test would spoil the measurement.
- The student must already be allowed to open the activity.
- A per-student daily limit and a monthly cap for the whole app, both reserved before the model is called
  and given back if the call fails. A hard cap keeps the bill predictable.
- The prompt has no student name and no answer key. The reply is checked before the student sees it, and a
  generic hint is shown instead if it fails the check.
"""
import os
import time

import student_service as svc
from cic import db, hints, keys, llm, validate
from cic.authz import student_from_auth
from cic.errors import ApiError, Forbidden, NotFound, RateLimited, ValidationError
from cic.ids import now_ms
from cic.log import log
from cic.progress import IN_PROGRESS

LOG_RETENTION_SECONDS = 180 * 24 * 3600
DAY_COUNTER_SECONDS = 3 * 24 * 3600
MONTH_COUNTER_SECONDS = 70 * 24 * 3600


class HintsUnavailable(ApiError):
    status_code = 503
    code = "HINTS_UNAVAILABLE"


def _cap(name: str, default: int) -> int:
    try:
        return max(0, int(os.environ.get(name, default)))
    except ValueError:
        return default


def _reserve(table, pk: str, sk: str, cap: int, keep_seconds: int):
    """Add one to a counter unless it has reached its cap. Returns the new count, or None at the cap."""
    try:
        resp = table.update_item(
            Key={"pk": pk, "sk": sk}, UpdateExpression="ADD #c :one SET #t = :ttl",
            ConditionExpression="attribute_not_exists(#c) OR #c < :cap",
            ExpressionAttributeNames={"#c": "count", "#t": "ttl"},
            ExpressionAttributeValues={":one": 1, ":cap": cap, ":ttl": int(time.time()) + keep_seconds},
            ReturnValues="UPDATED_NEW")
        return int(resp["Attributes"]["count"])
    except table.meta.client.exceptions.ConditionalCheckFailedException:
        return None


def _release(table, pk: str, sk: str) -> None:
    try:
        table.update_item(Key={"pk": pk, "sk": sk}, UpdateExpression="ADD #c :neg",
                          ExpressionAttributeNames={"#c": "count"}, ExpressionAttributeValues={":neg": -1})
    except Exception:  # noqa: BLE001 - best effort; a missed release only costs one hint
        pass


def hint(req):
    student = student_from_auth(req.auth)
    body = req.json()
    validate.reject_unknown(body, ("moduleId", "activityId", "questionId", "question", "code", "failedTests"))
    module_id = keys.safe_id(body.get("moduleId"), "moduleId")
    activity_id = keys.safe_id(body.get("activityId"), "activityId")
    question_id = keys.safe_id(body["questionId"], "questionId") if body.get("questionId") is not None else None
    question = validate.text(body, "question", 500, required=False)
    code = validate.text(body, "code", 6000, required=False)
    failed_ids = validate.string_list(body, "failedTests", 20) or []
    if not question and not code:
        raise ValidationError("Say what you are stuck on, or include your code")

    ctx = svc.load_ctx(student)
    activity = svc.find_activity(ctx.module(module_id), activity_id)
    if activity.get("type") not in hints.HINT_ACTIVITY_TYPES:
        raise Forbidden("Hints are not available for this activity", code="HINTS_NOT_ALLOWED")
    svc.assert_open(ctx, module_id, activity_id)
    items = hints.question_context(activity, question_id)
    labels = {t.get("testId"): t.get("label", "") for t in activity.get("tests") or []}
    failing = [labels[t] for t in failed_ids if t in labels]  # labels come from the module, never from the student
    if question_id and not items:
        raise NotFound("Question not found")

    prior = ctx.act_items.get((module_id, activity_id)) or {}
    level = min(int(prior.get("hintCount", 0)) + 1, hints.MAX_LEVEL)

    events = db.get_table(db.EVENTS)
    day, month = time.strftime("%Y%m%d", time.gmtime()), time.strftime("%Y%m", time.gmtime())
    day_cap, month_cap = _cap("HINTS_PER_DAY", 10), _cap("HINTS_MONTHLY_CAP", 5000)
    day_key, month_key = (f"HQ#{student.student_id}", f"D#{day}"), ("HQM", f"M#{month}")
    used = _reserve(events, *day_key, day_cap, DAY_COUNTER_SECONDS)
    if used is None:
        raise RateLimited("You have used all of today's hints. Ask your teacher for help.", code="HINT_LIMIT_REACHED")
    if _reserve(events, *month_key, month_cap, MONTH_COUNTER_SECONDS) is None:
        _release(events, *day_key)
        raise RateLimited("Hints are paused for this month. Ask your teacher for help.", code="AI_QUOTA_EXCEEDED")

    try:
        reply = llm.converse(hints.system_prompt(level), hints.build_user_message(activity, items, question, code, failing))
    except Exception as err:  # noqa: BLE001 - any model or network failure
        _release(events, *day_key)
        _release(events, *month_key)
        log("hint_model_error", level="ERROR", classId=student.class_id, errorType=type(err).__name__)
        raise HintsUnavailable("Hints are unavailable right now. Try again in a minute, or ask your teacher.")

    safe = hints.check_hint(reply["text"], items)
    text = safe or hints.fallback(level)
    now = now_ms()
    events.put_item(Item=db.to_dynamo({
        "pk": f"HINT#{student.class_id}", "sk": f"{now:013d}#{student.student_id}", "studentId": student.student_id,
        "moduleId": module_id, "activityId": activity_id, "questionId": question_id, "concepts": hints.concepts_of(items),
        "level": level, "question": question, "hint": text, "filtered": safe is None, "model": os.environ.get("HINT_MODEL_ID"),
        "inputTokens": reply["inputTokens"], "outputTokens": reply["outputTokens"], "ttl": int(time.time()) + LOG_RETENTION_SECONDS}))
    db.get_table(db.PROGRESS).update_item(
        Key={"pk": keys.stu_pk(student.student_id), "sk": keys.activity_sk(module_id, activity_id)},
        UpdateExpression="ADD hintCount :one SET classId = :c, lastActiveAt = :n, startedAt = if_not_exists(startedAt, :n), #st = if_not_exists(#st, :ip)",
        ExpressionAttributeNames={"#st": "status"},
        ExpressionAttributeValues={":one": 1, ":c": student.class_id, ":n": now, ":ip": IN_PROGRESS})
    log("hint", classId=student.class_id, moduleId=module_id, activityId=activity_id, level=level, filtered=safe is None,
        inputTokens=reply["inputTokens"], outputTokens=reply["outputTokens"])
    return {"hint": text, "level": level, "remainingToday": max(0, day_cap - used)}
