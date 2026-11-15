"""Runs the student player against data written by the class API and signed in through the real
login and authorizer, so a mismatch in item shapes between the two halves fails here."""
import json

from support import admin_auth, api_event, load_lambda

MODULE = {"moduleId": "py-loops", "title": "Loops", "lessons": [{"lessonId": "l1", "activities": [
    {"activityId": "pre", "type": "assessment", "role": "pre", "questions": [
        {"questionId": "p1", "type": "mcq", "answerKey": "a", "concept": "loops", "choices": [{"id": "a", "text": "x"}, {"id": "b", "text": "y"}]}]},
    {"activityId": "vid", "type": "video", "provider": "youtube", "videoId": "dQw4w9WgXcQ", "minSeconds": 5},
    {"activityId": "chk", "type": "check", "questions": [{"questionId": "c1", "type": "short", "answerKey": ["for"], "concept": "loops"}]},
    {"activityId": "post", "type": "assessment", "role": "post", "questions": [
        {"questionId": "q1", "type": "mcq", "answerKey": "a", "concept": "loops", "choices": [{"id": "a", "text": "x"}, {"id": "b", "text": "y"}]}]},
]}]}


def run(mod, route, body=None, auth=None, path=None, headers=None):
    resp = mod.lambda_handler(api_event(route, body, headers=headers, auth=auth, path=path), None)
    return resp["statusCode"], json.loads(resp["body"])


def test_student_works_through_a_module_set_up_by_the_class_api(tables):
    core, content = tables["CORE_TABLE"], tables["CONTENT_TABLE"]
    core.put_item(Item={"pk": "ORG#org_1", "sk": "META", "status": "active"})
    content.put_item(Item={"pk": "MOD#py-loops", "sk": "META", "latestVersion": 1})
    content.put_item(Item={"pk": "MOD#py-loops", "sk": "V#0001", "module": MODULE, "version": 1})

    classes, auth_student, authorizer, player = (load_lambda(n) for n in ("class-api", "auth-student", "authorizer-student", "student-api"))
    admin = admin_auth()
    status, body = run(classes, "POST /v1/classes", {"name": "Period 3", "orgId": "org_1"}, admin)
    class_id, join_code = body["data"]["classId"], body["data"]["joinCode"]
    cls = {"classId": class_id}
    assert run(classes, "POST /v1/classes/{classId}/assignments", {"moduleId": "py-loops"}, admin, cls)[0] == 201
    status, body = run(classes, "POST /v1/classes/{classId}/roster", {"displayName": "Ana R."}, admin, cls)
    assert status == 201
    words = body["data"]["studentCode"]

    status, body = run(auth_student, "POST /v1/auth/student/login", {"classCode": join_code, "studentCode": words})
    assert status == 200
    token = body["data"]["sessionToken"]
    decision = authorizer.lambda_handler({"headers": {"authorization": f"Bearer {token}"}}, None)
    assert decision["isAuthorized"] is True
    student = {"lambda": decision["context"]}

    def call(route, path=None, body=None):
        return run(player, route, body, student, path)

    status, body = call("GET /v1/student/home")
    assert status == 200 and body["data"]["student"]["displayName"] == "Ana R."
    assert body["data"]["resume"] == {"moduleId": "py-loops", "activityId": "pre"}

    act = lambda name: {"moduleId": "py-loops", "activityId": name}  # noqa: E731
    submit = lambda name, answers, n: call("POST /v1/student/modules/{moduleId}/activities/{activityId}/submit", act(name),  # noqa: E731
                                           {"clientSubmissionId": f"client-sub-{n:03d}", "answers": answers})
    assert submit("pre", [{"questionId": "p1", "value": "b"}], 1)[0] == 200
    call("POST /v1/student/modules/{moduleId}/activities/{activityId}/heartbeat", act("vid"), {"seconds": 10})
    assert call("POST /v1/student/modules/{moduleId}/activities/{activityId}/complete", act("vid"))[0] == 200
    assert submit("chk", [{"questionId": "c1", "value": "FOR"}], 2)[1]["data"]["passed"] is True
    status, body = submit("post", [{"questionId": "q1", "value": "a"}], 3)
    assert status == 200 and body["data"]["next"] == {"type": "module_complete"}

    # the class API's credential reset must end this student's session (credVersion lives on the roster item)
    student_id = core.query(KeyConditionExpression="pk = :p AND begins_with(sk, :s)",
                            ExpressionAttributeValues={":p": f"CLS#{class_id}", ":s": "STU#"})["Items"][0]["sk"].split("#")[1]
    assert run(classes, "POST /v1/classes/{classId}/credentials", {"studentIds": [student_id]}, admin, cls)[0] == 200
    assert authorizer.lambda_handler({"headers": {"authorization": f"Bearer {token}"}}, None)["isAuthorized"] is False
