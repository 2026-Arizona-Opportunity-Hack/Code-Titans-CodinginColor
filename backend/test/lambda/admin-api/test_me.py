import json

import pytest
from support import api_event, load_lambda


@pytest.fixture
def admin():
    return load_lambda("admin-api")


def call(admin, groups, sub="u1"):
    claims = {"sub": sub, "name": "Pat", "cognito:groups": groups}
    resp = admin.lambda_handler(api_event("GET /v1/me", auth={"jwt": {"claims": claims}}), None)
    return resp, json.loads(resp["body"])


def test_admin_can_author(admin, table):
    resp, body = call(admin, "[cic_admin]")
    assert resp["statusCode"] == 200
    assert body["data"]["role"] == "cic_admin" and body["data"]["permissions"]["canAuthor"] is True


def test_instructor_is_not_an_author_by_default_and_lists_classes(admin, table):
    table.put_item(Item={"pk": "CLS#cls_01", "sk": "INS#u1", "gsi1pk": "USR#u1", "gsi1sk": "CLS#cls_01"})
    _, body = call(admin, "[instructor]")
    assert body["data"]["permissions"] == {"canAuthor": False, "canEditAll": False}
    assert body["data"]["classes"] == [{"classId": "cls_01"}]


def test_instructor_an_admin_made_an_author(admin, table):
    table.put_item(Item={"pk": "USR#u1", "sk": "META", "canAuthor": True})
    _, body = call(admin, "[instructor]")
    assert body["data"]["permissions"] == {"canAuthor": True, "canEditAll": True}


def test_reviewer_has_no_classes_and_cannot_author_even_with_flag(admin, table):
    table.put_item(Item={"pk": "USR#u1", "sk": "META", "canAuthor": True})
    _, body = call(admin, "[reviewer]")
    assert body["data"]["role"] == "reviewer" and body["data"]["classes"] == []
    assert body["data"]["permissions"]["canAuthor"] is False


def test_highest_role_wins(admin, table):
    _, body = call(admin, "[reviewer instructor]")
    assert body["data"]["role"] == "instructor"


def test_no_group_is_forbidden(admin, table):
    resp, body = call(admin, "")
    assert resp["statusCode"] == 403 and body["code"] == "FORBIDDEN"


def test_missing_claims_is_unauthenticated(admin, table):
    resp = admin.lambda_handler(api_event("GET /v1/me", auth={"jwt": {"claims": {}}}), None)
    assert resp["statusCode"] == 401


def test_me_returns_the_school_or_null(admin, table):
    assert call(admin, "[instructor]")[1]["data"]["orgId"] is None
    table.put_item(Item={"pk": "USR#u1", "sk": "META", "orgId": "org_1"})
    assert call(admin, "[instructor]")[1]["data"]["orgId"] == "org_1"


def test_me_returns_the_school_name_for_the_header(admin, table):
    assert call(admin, "[instructor]")[1]["data"]["orgName"] is None
    table.put_item(Item={"pk": "ORG#org_1", "sk": "META", "name": "Maryvale High School", "status": "active"})
    table.put_item(Item={"pk": "USR#u1", "sk": "META", "orgId": "org_1"})
    data = call(admin, "[instructor]")[1]["data"]
    assert (data["orgId"], data["orgName"]) == ("org_1", "Maryvale High School")
    table.delete_item(Key={"pk": "ORG#org_1", "sk": "META"})  # a school that no longer exists
    assert call(admin, "[instructor]")[1]["data"]["orgName"] is None
def test_external_teacher_lists_own_classes_and_never_authors(admin, table):
    table.put_item(Item={"pk": "CLS#cls_x", "sk": "INS#u1", "gsi1pk": "USR#u1", "gsi1sk": "CLS#cls_x"})
    table.put_item(Item={"pk": "USR#u1", "sk": "META", "canAuthor": True})  # a stray flag does not help
    _, body = call(admin, "[external_teacher]")
    assert body["data"]["role"] == "external_teacher" and body["data"]["classes"] == [{"classId": "cls_x"}]
    assert body["data"]["permissions"] == {"canAuthor": False, "canEditAll": False}
