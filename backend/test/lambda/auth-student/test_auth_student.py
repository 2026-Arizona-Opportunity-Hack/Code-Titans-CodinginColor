import json

import pytest
from support import api_event, load_lambda

LOGIN = "POST /v1/auth/student/login"
LOGOUT = "POST /v1/auth/student/logout"


@pytest.fixture
def auth():
    return load_lambda("auth-student")


def login(auth, code="K7M4QX", words="panda-tiger-river"):
    resp = auth.lambda_handler(api_event(LOGIN, {"classCode": code, "studentCode": words}), None)
    return resp, json.loads(resp["body"])


def test_login_success_returns_session(auth, seeded):
    resp, body = login(auth)
    assert resp["statusCode"] == 200
    data = body["data"]
    assert data["sessionToken"].startswith("ses_")
    assert data["student"] == {"displayName": "Ana R.", "classId": "cls_01"}
    assert data["expiresAt"].endswith("Z")


def test_login_accepts_spaces_and_case(auth, seeded):
    resp, _ = login(auth, code="k7m4-qx", words="Panda Tiger  RIVER")
    assert resp["statusCode"] == 200


def test_wrong_words_and_wrong_class_look_identical(auth, seeded):
    r1, b1 = login(auth, words="panda-tiger-army")
    r2, b2 = login(auth, code="ZZZZZZ")
    assert r1["statusCode"] == r2["statusCode"] == 401
    assert b1["code"] == b2["code"] == "INVALID_CREDENTIALS"
    assert b1["error"] == b2["error"]


def test_words_outside_wordlist_are_invalid_credentials(auth, seeded):
    resp, body = login(auth, words="not-a-real-word")
    assert resp["statusCode"] == 401 and body["code"] == "INVALID_CREDENTIALS"


def test_missing_fields_and_bad_json_are_validation_errors(auth, seeded):
    for body in ({}, "{nope"):
        resp = auth.lambda_handler(api_event(LOGIN, body), None)
        assert resp["statusCode"] == 400


def test_class_locks_after_ten_failures_even_for_correct_words(auth, seeded):
    for _ in range(10):
        login(auth, words="panda-tiger-army")
    resp, body = login(auth)
    assert resp["statusCode"] == 429 and body["code"] == "LOGIN_THROTTLED"
    assert int(resp["headers"]["Retry-After"]) > 0


def test_inactive_student_cannot_login(auth, seeded, table):
    table.update_item(Key={"pk": "CLS#cls_01", "sk": "STU#stu_01"},
                      UpdateExpression="SET #s = :v", ExpressionAttributeNames={"#s": "status"},
                      ExpressionAttributeValues={":v": "inactive"})
    resp, _ = login(auth)
    assert resp["statusCode"] == 401


def test_token_is_stored_only_as_hash(auth, seeded, table):
    _, body = login(auth)
    token = body["data"]["sessionToken"]
    assert not any(token in json.dumps(i, default=str) for i in table.scan()["Items"])


def test_logout_deletes_session(auth, seeded):
    from cic import sessions
    _, body = login(auth)
    token = body["data"]["sessionToken"]
    event = api_event(LOGOUT, headers={"authorization": f"Bearer {token}"},
                      auth={"lambda": {"studentId": "stu_01", "classId": "cls_01"}})
    assert auth.lambda_handler(event, None)["statusCode"] == 200
    assert sessions.resolve_session(token) is None


def test_logout_without_authorizer_context_is_401(auth, seeded):
    assert auth.lambda_handler(api_event(LOGOUT), None)["statusCode"] == 401
