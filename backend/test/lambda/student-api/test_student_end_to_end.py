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
