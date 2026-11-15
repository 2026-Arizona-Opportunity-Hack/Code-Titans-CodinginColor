"""Runs the student player against data written by the class API and signed in through the real
login and authorizer, so a mismatch in item shapes between the two halves fails here."""
from integration import Setup, run


def test_student_works_through_a_module_set_up_by_the_class_api(tables):
    s = Setup(tables)
    student_id, words = s.add_student("Ana R.")
    token, student = s.sign_in(words)

    status, body = s.play(student, "GET /v1/student/home")
    assert status == 200 and body["data"]["student"]["displayName"] == "Ana R."
    assert body["data"]["resume"] == {"moduleId": "py-loops", "activityId": "pre"}

    status, body = s.finish_module(student)
    assert status == 200 and body["data"]["next"] == {"type": "module_complete"}
    assert s.play(student, "GET /v1/student/home")[1]["data"]["modules"][0]["state"] == "complete"

    # the class API's credential reset must end this session (credVersion lives on the roster item)
    assert run(s.classes, "POST /v1/classes/{classId}/credentials", {"studentIds": [student_id]}, s.admin, s.cls)[0] == 200
    assert s.authorizer.lambda_handler({"headers": {"authorization": f"Bearer {token}"}}, None)["isAuthorized"] is False


def test_hint_works_for_a_student_signed_in_through_the_real_login(tables, monkeypatch):
    monkeypatch.setenv("BEDROCK_REGION", "us-west-2")
    monkeypatch.setenv("HINT_MODEL_ID", "amazon.nova-lite-v1:0")
    prompts = []
    monkeypatch.setattr("cic.llm.converse", lambda system, user, **kw: prompts.append(user) or {"text": "What does the loop need between the brackets?", "inputTokens": 60, "outputTokens": 12})
    s = Setup(tables)
    _, words = s.add_student("Ana Rodriguez")
    _, student = s.sign_in(words)
    act = lambda name: {"moduleId": "py-loops", "activityId": name}  # noqa: E731
    base = "/v1/student/modules/{moduleId}/activities/{activityId}"
    s.play(student, f"POST {base}/submit", act("pre"), {"clientSubmissionId": "client-sub-001", "answers": [{"questionId": "p1", "value": "b"}]})
    s.play(student, f"POST {base}/heartbeat", act("vid"), {"seconds": 10})
    s.play(student, f"POST {base}/complete", act("vid"))

    status, body = s.play(student, "POST /v1/student/hints", None, {"moduleId": "py-loops", "activityId": "chk", "question": "I am stuck"})
    assert status == 200 and body["data"]["level"] == 1 and body["data"]["remainingToday"] == 9
    assert "Ana" not in prompts[0] and "<do_not_say>for</do_not_say>" in prompts[0]
    # a test activity is refused even for a signed-in student
    status, body = s.play(student, "POST /v1/student/hints", None, {"moduleId": "py-loops", "activityId": "post", "question": "help"})
    assert status == 403 and body["code"] == "HINTS_NOT_ALLOWED"
