import json

import boto3
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
    status, body = call(api, "POST /v1/classes", {"name": "Period 3", "orgId": "org_1"})
    assert status == 201
    return body["data"]["classId"]


def add(api, cls, name="Ana R.", who=INS, **extra):
    return call(api, "POST /v1/classes/{classId}/roster", {"displayName": name, **extra},
                who=who, path={"classId": cls})


def roster(api, cls, who=INS, **query):
    return call(api, "GET /v1/classes/{classId}/roster", who=who, path={"classId": cls}, query=query or None)[1]["data"]


def test_add_student_returns_code_once_and_never_stores_it(api, cls, table):
    status, body = add(api, cls, externalId="1042")
    data = body["data"]
    assert status == 201 and data["rosterNumber"] == 1 and data["hasCredential"] is True
    assert len(data["studentCode"].split("-")) == 3
    stored = json.dumps(table.get_item(Key={"pk": f"CLS#{cls}", "sk": f"STU#{data['studentId']}"})["Item"], default=str)
    assert data["studentCode"] not in stored
    assert table.get_item(Key={"pk": f"STU#{data['studentId']}", "sk": "META"})["Item"]["classId"] == cls
    listed = roster(api, cls)
    assert listed[0]["studentId"] == data["studentId"] and "studentCode" not in listed[0]
    assert "credHmac" not in json.dumps(listed)


def test_new_student_can_log_in_with_the_issued_code(api, cls, table):
    from cic.identity import authenticate
    code = table.get_item(Key={"pk": f"CLS#{cls}", "sk": "META"})["Item"]["joinCode"]
    data = add(api, cls)[1]["data"]
    assert authenticate(code, data["studentCode"]).display_name == "Ana R."


def test_roster_numbers_increase_and_are_never_reused(api, cls):
    first = add(api, cls, "A")[1]["data"]
    add(api, cls, "B")
    call(api, "DELETE /v1/classes/{classId}/roster/{studentId}", who=ADMIN,
         path={"classId": cls, "studentId": first["studentId"]})
    third = add(api, cls, "C")[1]["data"]
    assert third["rosterNumber"] == 3


def test_same_name_is_a_new_student_flagged_as_possible_duplicate(api, cls):
    a = add(api, cls, "Alex Kim")[1]["data"]
    b = add(api, cls, "  alex   KIM ")[1]["data"]
    assert b["studentId"] != a["studentId"] and b["possibleDuplicateOf"] == a["studentId"]
    dups = call(api, "GET /v1/classes/{classId}/roster/duplicates", path={"classId": cls})[1]["data"]
    assert len(dups) == 1 and len(dups[0]["students"]) == 2


def test_external_id_conflict_and_validation(api, cls):
    add(api, cls, "A", externalId="9")
    assert add(api, cls, "B", externalId="9")[0] == 409
    for extra in ({"displayName": ""}, {"displayName": "x" * 101}, {"startModuleId": "nope"}, {"role": "admin"}):
        body = {"displayName": "ok", **extra}
        assert call(api, "POST /v1/classes/{classId}/roster", body, path={"classId": cls})[0] == 400


def test_start_module_defaults_to_class_current_module(api, cls):
    call(api, "PATCH /v1/classes/{classId}", {"currentModuleId": "py-loops"}, path={"classId": cls})
    assert add(api, cls, "Late")[1]["data"]["startModuleId"] == "py-loops"
    assert add(api, cls, "Explicit", startModuleId="py-loops")[1]["data"]["startModuleId"] == "py-loops"


def test_roster_search_and_status_filter(api, cls):
    add(api, cls, "Ana R.")
    ben = add(api, cls, "Ben T.")[1]["data"]
    call(api, "PATCH /v1/classes/{classId}/roster/{studentId}", {"status": "inactive"},
         path={"classId": cls, "studentId": ben["studentId"]})
    assert [s["displayName"] for s in roster(api, cls, q="ANA")] == ["Ana R."]
    assert [s["displayName"] for s in roster(api, cls, status="inactive")] == ["Ben T."]
    assert call(api, "GET /v1/classes/{classId}/roster", path={"classId": cls}, query={"status": "gone"})[0] == 400


def test_rename_and_deactivate_blocks_login_session(api, cls, table):
    from cic import sessions
    data = add(api, cls)[1]["data"]
    sid = data["studentId"]
    token, _ = sessions.create_session(sid, cls, 1)
    path = {"classId": cls, "studentId": sid}
    _, body = call(api, "PATCH /v1/classes/{classId}/roster/{studentId}",
                   {"displayName": "Ana Rivera", "status": "inactive"}, path=path)
    assert body["data"]["displayName"] == "Ana Rivera" and body["data"]["status"] == "inactive"
    from conftest import load_lambda
    authz = load_lambda("authorizer-student")
    assert authz.lambda_handler({"headers": {"authorization": f"Bearer {token}"}}, None)["isAuthorized"] is False


def test_patch_unknown_student_404_and_bad_body_400(api, cls):
    path = {"classId": cls, "studentId": "nope"}
    assert call(api, "PATCH /v1/classes/{classId}/roster/{studentId}", {"displayName": "x"}, path=path)[0] == 404
    sid = add(api, cls)[1]["data"]["studentId"]
    for body in ({}, {"status": "deleted"}, {"externalId": "x"}):
        assert call(api, "PATCH /v1/classes/{classId}/roster/{studentId}", body,
                    path={"classId": cls, "studentId": sid})[0] == 400


def test_delete_is_admin_only_and_removes_progress(api, cls, table):
    sid = add(api, cls)[1]["data"]["studentId"]
    boto3.resource("dynamodb").Table("progress").put_item(Item={"pk": f"STU#{sid}", "sk": "ACT#m#a"})
    path = {"classId": cls, "studentId": sid}
    assert call(api, "DELETE /v1/classes/{classId}/roster/{studentId}", who=INS, path=path)[0] == 403
    assert call(api, "DELETE /v1/classes/{classId}/roster/{studentId}", who=ADMIN, path=path)[0] == 200
    assert roster(api, cls) == []
    assert "Item" not in table.get_item(Key={"pk": f"STU#{sid}", "sk": "META"})
    assert boto3.resource("dynamodb").Table("progress").scan()["Items"] == []
    assert call(api, "DELETE /v1/classes/{classId}/roster/{studentId}", who=ADMIN, path=path)[0] == 404


def test_other_instructors_and_reviewers_cannot_touch_roster(api, cls):
    sid = add(api, cls)[1]["data"]["studentId"]
    path = {"classId": cls}
    for who in (INS2, REV):
        assert call(api, "GET /v1/classes/{classId}/roster", who=who, path=path)[0] == 403
        assert call(api, "POST /v1/classes/{classId}/roster", {"displayName": "x"}, who=who, path=path)[0] == 403
        assert call(api, "GET /v1/students/{studentId}", who=who, path={"studentId": sid})[0] == 403


def test_get_student_by_id_checks_the_students_class(api, cls):
    sid = add(api, cls, "Ana R.")[1]["data"]["studentId"]
    ok = call(api, "GET /v1/students/{studentId}", path={"studentId": sid})
    assert ok[0] == 200 and ok[1]["data"]["displayName"] == "Ana R." and ok[1]["data"]["classId"] == cls
    # unknown ID looks like "not yours" to instructors, so IDs cannot be probed
    assert call(api, "GET /v1/students/{studentId}", path={"studentId": "missing"})[0] == 403
    assert call(api, "GET /v1/students/{studentId}", who=ADMIN, path={"studentId": "missing"})[0] == 404
    assert call(api, "GET /v1/students/{studentId}", who=ADMIN, path={"studentId": "a#b"})[0] == 404
