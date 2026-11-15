import json
import os

import pytest
from support import api_event

ADMIN = ("[cic_admin]", "adm-1")
INS = ("[instructor]", "ins-1")
INS2 = ("[instructor]", "ins-2")
REV = ("[reviewer]", "rev-1")


def call(api, route, body=None, who=INS, path=None, query=None):
    auth = {"jwt": {"claims": {"sub": who[1], "cognito:groups": who[0]}}}
    resp = api.lambda_handler(api_event(route, body, auth=auth, path=path, query=query), None)
    return resp["statusCode"], json.loads(resp["body"])


@pytest.fixture
def cls(api):
    os.environ["APP_URL"] = "https://app.example.org/"
    data = call(api, "POST /v1/classes", {"name": "P3", "orgId": "org_1"})[1]["data"]
    call(api, "POST /v1/classes/{classId}/roster/import", {"csv": "displayName\nAna R.\nBen T.\nCy S.\n"},
         path={"classId": data["classId"]})
    return data["classId"], data["joinCode"]


def issue(api, cid, body=None, who=INS):
    return call(api, "POST /v1/classes/{classId}/credentials", body, who=who, path={"classId": cid})


def test_issue_for_whole_class_returns_login_sheet_and_students_can_sign_in(api, cls):
    from cic.identity import authenticate
    cid, code = cls
    status, body = issue(api, cid)
    sheet = body["data"]
    assert status == 200 and sheet["classCode"] == code and sheet["loginUrlBase"] == "https://app.example.org/s"
    assert [s["displayName"] for s in sheet["students"]] == ["Ana R.", "Ben T.", "Cy S."]
    assert len({s["studentCode"] for s in sheet["students"]}) == 3
    for s in sheet["students"]:
        assert authenticate(code, s["studentCode"]).student_id == s["studentId"]


def test_words_are_not_stored(api, cls, table):
    cid, _ = cls
    sheet = issue(api, cid)[1]["data"]
    stored = json.dumps(table.scan()["Items"], default=str)
    assert not any(s["studentCode"] in stored for s in sheet["students"])


def test_reset_one_student_invalidates_old_words_and_sessions_only_for_them(api, cls):
    from cic import sessions
    from cic.errors import InvalidCredentials
    from cic.identity import authenticate
    from support import load_lambda
    cid, code = cls
    first = {s["displayName"]: s for s in issue(api, cid)[1]["data"]["students"]}
    ana, ben = first["Ana R."], first["Ben T."]
    token_ana, _ = sessions.create_session(ana["studentId"], cid, authenticate(code, ana["studentCode"]).cred_version)
    token_ben, _ = sessions.create_session(ben["studentId"], cid, authenticate(code, ben["studentCode"]).cred_version)

    again = issue(api, cid, {"studentIds": [ana["studentId"]]})[1]["data"]["students"]
    assert len(again) == 1 and again[0]["studentCode"] != ana["studentCode"]
    with pytest.raises(InvalidCredentials):
        authenticate(code, ana["studentCode"])
    assert authenticate(code, again[0]["studentCode"]).student_id == ana["studentId"]
    assert authenticate(code, ben["studentCode"]).student_id == ben["studentId"]  # untouched

    authz = load_lambda("authorizer-student")
    check = lambda t: authz.lambda_handler({"headers": {"authorization": f"Bearer {t}"}}, None)["isAuthorized"]
    assert check(token_ana) is False and check(token_ben) is True


def test_inactive_students_are_skipped_or_refused(api, cls):
    cid, _ = cls
    roster = call(api, "GET /v1/classes/{classId}/roster", path={"classId": cid})[1]["data"]
    ben = next(s for s in roster if s["displayName"] == "Ben T.")
    call(api, "PATCH /v1/classes/{classId}/roster/{studentId}", {"status": "inactive"},
         path={"classId": cid, "studentId": ben["studentId"]})
    assert [s["displayName"] for s in issue(api, cid)[1]["data"]["students"]] == ["Ana R.", "Cy S."]
    assert issue(api, cid, {"studentIds": [ben["studentId"]]})[0] == 400


@pytest.mark.parametrize("body", [{"studentIds": ["nope"]}, {"studentIds": "x"}, {"studentIds": [1]}, {"extra": 1}])
def test_validation(api, cls, body):
    assert issue(api, cls[0], body)[0] == 400


def test_other_instructors_and_reviewers_are_refused(api, cls):
    for who in (INS2, REV):
        assert issue(api, cls[0], who=who)[0] == 403
    assert issue(api, cls[0], who=ADMIN)[0] == 200


def test_rotate_join_code_replaces_the_old_one(api, cls, table):
    from cic.identity import find_class_by_code
    cid, old = cls
    status, body = call(api, "POST /v1/classes/{classId}/join-code/rotate", path={"classId": cid})
    new = body["data"]["joinCode"]
    assert status == 200 and new != old and len(new) == 6
    assert find_class_by_code(old) is None and find_class_by_code(new)["pk"] == f"CLS#{cid}"
    assert "Item" not in table.get_item(Key={"pk": f"JOIN#{old}", "sk": "META"})
    assert table.get_item(Key={"pk": f"JOIN#{new}", "sk": "META"})["Item"]["classId"] == cid
    assert call(api, "GET /v1/classes/{classId}", path={"classId": cid})[1]["data"]["joinCode"] == new


def test_rotate_retries_when_a_code_is_taken(api, cls, monkeypatch):
    import credential_routes
    cid, old = cls
    other = call(api, "POST /v1/classes", {"name": "P4", "orgId": "org_1"})[1]["data"]["joinCode"]
    codes = iter([other, "ZZZZZZ"])
    monkeypatch.setattr(credential_routes, "new_join_code", lambda: next(codes))
    assert call(api, "POST /v1/classes/{classId}/join-code/rotate", path={"classId": cid})[1]["data"]["joinCode"] == "ZZZZZZ"


def test_rotate_access(api, cls):
    for who in (INS2, REV):
        assert call(api, "POST /v1/classes/{classId}/join-code/rotate", who=who, path={"classId": cls[0]})[0] == 403
    assert call(api, "POST /v1/classes/{classId}/join-code/rotate", path={"classId": "cls_nope"}, who=ADMIN)[0] == 404
