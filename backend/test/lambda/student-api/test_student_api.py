import json

import pytest
from support import load_lambda

from cic import keys

CLASS_ID, STUDENT = "cls1", "stu1"


def module(mid):
    return {
        "moduleId": mid, "title": mid.upper(),
        "lessons": [{"lessonId": "l1", "activities": [
            {"activityId": f"{mid}-pre", "type": "assessment", "role": "pre", "questions": [
                {"questionId": "p1", "type": "mcq", "answerKey": "a", "concept": "loops", "explanation": "secret"}]},
            {"activityId": f"{mid}-vid", "type": "video", "videoId": "abc", "minSeconds": 10},
            {"activityId": f"{mid}-chk", "type": "check", "passPct": 100, "questions": [
                {"questionId": "c1", "type": "mcq", "answerKey": "b", "concept": "loops", "explanation": "because"}]},
            {"activityId": f"{mid}-ws", "type": "worksheet", "fields": [
                {"fieldId": "f1", "type": "short", "answerKey": ["yes"]}, {"fieldId": "f2", "type": "text"}]},
            {"activityId": f"{mid}-post", "type": "assessment", "role": "post", "questions": [
                {"questionId": "q1", "type": "mcq", "answerKey": "a", "concept": "loops"}]},
        ]}],
    }


@pytest.fixture
def api(tables):
    core, content = tables["CORE_TABLE"], tables["CONTENT_TABLE"]
    core.put_item(Item={"pk": f"CLS#{CLASS_ID}", "sk": "META", "cohortId": "coh1"})
    core.put_item(Item={"pk": f"CLS#{CLASS_ID}", "sk": f"STU#{STUDENT}", "displayName": "Ana R.", "status": "active"})
    for i, mid in enumerate(["m1", "m2"], start=1):
        content.put_item(Item={"pk": f"MOD#{mid}", "sk": "V#0001", "module": module(mid)})
        core.put_item(Item={"pk": f"CLS#{CLASS_ID}", "sk": f"ASG#{i:04d}#{mid}", "moduleId": mid, "moduleVersion": 1})
    mod = load_lambda("student-api")

    def call(route, path=None, body=None, student=STUDENT):
        event = {"routeKey": route, "pathParameters": path or {}, "body": json.dumps(body) if body is not None else None,
                 "headers": {}, "requestContext": {"requestId": "r", "http": {"method": route.split()[0]},
                 "authorizer": {"lambda": {"studentId": student, "classId": CLASS_ID}}}}
        resp = mod.lambda_handler(event, None)
        return resp["statusCode"], json.loads(resp["body"])

    return call


def act(mid, name):
    return {"moduleId": mid, "activityId": f"{mid}-{name}"}


def submit(api, mid, name, answers, csid):
    return api("POST /v1/student/modules/{moduleId}/activities/{activityId}/submit", act(mid, name),
               {"clientSubmissionId": csid, "answers": answers})


def test_home_starts_at_first_module_with_pretest(api):
    status, body = api("GET /v1/student/home")
    assert status == 200
    d = body["data"]
    assert d["student"]["displayName"] == "Ana R."
    assert [m["state"] for m in d["modules"]] == ["available", "locked"]
    assert d["resume"] == {"moduleId": "m1", "activityId": "m1-pre"}


def test_module_payload_has_no_answer_keys_and_locked_module_is_refused(api):
    status, body = api("GET /v1/student/modules/{moduleId}", {"moduleId": "m1"})
    text = json.dumps(body)
    assert status == 200 and "answerKey" not in text and "secret" not in text and "because" not in text
    status, body = api("GET /v1/student/modules/{moduleId}", {"moduleId": "m2"})
    assert status == 403 and body["code"] == "MODULE_LOCKED"


def test_activities_must_be_done_in_order(api):
    status, body = submit(api, "m1", "chk", [{"questionId": "c1", "value": "b"}], "client-sub-001")
    assert status == 403 and body["code"] == "ACTIVITY_LOCKED"


def test_pretest_hides_score_and_can_only_be_submitted_once(api):
    status, body = submit(api, "m1", "pre", [{"questionId": "p1", "value": "a"}], "client-sub-001")
    assert status == 200
    assert body["data"]["recorded"] is True and "scorePct" not in body["data"] and "results" not in body["data"]
    assert body["data"]["next"] == {"type": "activity", "activityId": "m1-vid"}
    status, body = submit(api, "m1", "pre", [{"questionId": "p1", "value": "b"}], "client-sub-002")
    assert status == 403 and body["code"] == "ASSESSMENT_ALREADY_SUBMITTED"


def test_retry_with_same_client_submission_id_returns_the_first_result(api, tables):
    first = submit(api, "m1", "pre", [{"questionId": "p1", "value": "a"}], "client-sub-001")
    again = submit(api, "m1", "pre", [{"questionId": "p1", "value": "a"}], "client-sub-001")
    assert again[0] == 200 and again[1] == first[1]
    asm = tables["PROGRESS_TABLE"].get_item(Key={"pk": "STU#stu1", "sk": keys.assessment_sk("m1", "pre")})["Item"]
    assert asm["scorePct"] == 100 and asm["byConcept"]["loops"]["items"] == 1


def test_full_module_flow_unlocks_the_next_module(api, tables):
    submit(api, "m1", "pre", [{"questionId": "p1", "value": "a"}], "client-sub-001")
    path = act("m1", "vid")
    api("POST /v1/student/modules/{moduleId}/activities/{activityId}/heartbeat", path, {"seconds": 30})
    status, body = api("POST /v1/student/modules/{moduleId}/activities/{activityId}/complete", path)
    assert status == 200 and body["data"]["next"]["activityId"] == "m1-chk"

    wrong = submit(api, "m1", "chk", [{"questionId": "c1", "value": "a"}], "client-sub-003")
    assert wrong[1]["data"]["passed"] is False and wrong[1]["data"]["activityState"] == "in_progress"
    right = submit(api, "m1", "chk", [{"questionId": "c1", "value": "b"}], "client-sub-004")
    assert right[1]["data"]["passed"] is True and right[1]["data"]["results"][0]["explanation"] == "because"

    ws = submit(api, "m1", "ws", [{"questionId": "f1", "value": "Yes"}, {"questionId": "f2", "value": "my notes"}], "client-sub-005")
    assert ws[1]["data"]["pendingReview"] is True and ws[1]["data"]["autoScorePct"] == 100.0
    pending = tables["PROGRESS_TABLE"].query(IndexName="gsi2", KeyConditionExpression="gsi2pk = :p",
                                             ExpressionAttributeValues={":p": "CLS#cls1#REVIEW"})
    assert pending["Count"] == 1

    done = submit(api, "m1", "post", [{"questionId": "q1", "value": "a"}], "client-sub-006")
    assert done[1]["data"]["next"] == {"type": "module_complete"} and done[1]["data"]["moduleUnlocked"] == "m2"
    _, home = api("GET /v1/student/home")
    assert [m["state"] for m in home["data"]["modules"]] == ["complete", "available"]
    state = tables["PROGRESS_TABLE"].get_item(Key={"pk": "STU#stu1", "sk": "MOD#m1"})["Item"]
    assert state["state"] == "complete" and state["gsi1pk"] == "CLS#cls1#MOD#m1"


def test_cannot_mark_video_done_too_early(api):
    submit(api, "m1", "pre", [{"questionId": "p1", "value": "a"}], "client-sub-001")
    status, body = api("POST /v1/student/modules/{moduleId}/activities/{activityId}/complete", act("m1", "vid"))
    assert status == 409 and body["code"] == "TOO_EARLY"
    assert body["details"]["secondsCounted"] == 0 and body["details"]["secondsLeft"] == body["details"]["secondsNeeded"] > 0
    api("POST /v1/student/modules/{moduleId}/activities/{activityId}/heartbeat", act("m1", "vid"), {"seconds": 10})
    _, module = api("GET /v1/student/modules/{moduleId}", {"moduleId": "m1"})
    vid = next(a for l in module["data"]["lessons"] for a in l["activities"] if a["activityId"] == "m1-vid")
    assert vid["activeSeconds"] == 10  # the page shows the countdown from this


def test_heartbeat_credit_is_capped_and_validated(api, tables):
    path = act("m1", "pre")
    status, body = api("POST /v1/student/modules/{moduleId}/activities/{activityId}/heartbeat", path, {"seconds": 100})
    assert status == 200 and body["data"]["credited"] == 45
    for bad in (0, 500, "x", True):
        assert api("POST /v1/student/modules/{moduleId}/activities/{activityId}/heartbeat", path, {"seconds": bad})[0] == 400


def test_student_cannot_submit_unknown_questions_or_other_modules(api):
    assert submit(api, "m1", "pre", [{"questionId": "nope", "value": "a"}], "client-sub-001")[0] == 400
    assert api("GET /v1/student/modules/{moduleId}", {"moduleId": "other"})[0] == 404
    assert api("GET /v1/student/modules/{moduleId}", {"moduleId": "a#b"})[0] == 400


def test_inactive_student_is_refused(api, tables):
    tables["CORE_TABLE"].put_item(Item={"pk": "CLS#cls1", "sk": "STU#stu1", "displayName": "Ana R.", "status": "inactive"})
    assert api("GET /v1/student/home")[0] == 403


def test_late_joiner_start_module_drops_student_at_the_right_module(api, tables):
    tables["CORE_TABLE"].put_item(Item={"pk": "CLS#cls1", "sk": "STU#stu1", "displayName": "Ana R.", "status": "active", "startModuleId": "m2"})
    _, body = api("GET /v1/student/home")
    assert [m["state"] for m in body["data"]["modules"]] == ["catch_up", "available"]
    assert body["data"]["resume"]["moduleId"] == "m2"


def test_worksheet_draft_is_saved_and_returned(api):
    submit(api, "m1", "pre", [{"questionId": "p1", "value": "a"}], "client-sub-001")
    # open the worksheet by completing the earlier activities through the API
    api("POST /v1/student/modules/{moduleId}/activities/{activityId}/heartbeat", act("m1", "vid"), {"seconds": 20})
    api("POST /v1/student/modules/{moduleId}/activities/{activityId}/complete", act("m1", "vid"))
    submit(api, "m1", "chk", [{"questionId": "c1", "value": "b"}], "client-sub-002")
    status, _ = api("PUT /v1/student/modules/{moduleId}/activities/{activityId}/draft", act("m1", "ws"),
                    {"answers": [{"questionId": "f2", "value": "work in progress"}]})
    assert status == 200
    _, mod = api("GET /v1/student/modules/{moduleId}", {"moduleId": "m1"})
    ws = next(a for a in mod["data"]["lessons"][0]["activities"] if a["activityId"] == "m1-ws")
    assert ws["draft"] == {"f2": "work in progress"} and ws["state"] in ("available", "in_progress")
