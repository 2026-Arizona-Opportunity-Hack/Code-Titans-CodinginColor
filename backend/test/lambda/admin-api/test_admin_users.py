import json
import os

import boto3
import pytest
from moto import mock_aws
from support import admin_auth, api_event, load_lambda


@pytest.fixture
def pool():
    with mock_aws():
        client = boto3.client("cognito-idp")
        pid = client.create_user_pool(PoolName="staff", UsernameAttributes=["email"])["UserPool"]["Id"]
        for group in ("cic_admin", "instructor", "reviewer"):
            client.create_group(UserPoolId=pid, GroupName=group)
        os.environ["USER_POOL_ID"] = pid
        yield client, pid


@pytest.fixture
def admin(pool, table):
    module = load_lambda("admin-api")
    import admin_users
    admin_users._client = None
    return module


def call(admin, route, body=None, groups="[cic_admin]", sub="me-admin-0001", path=None, query=None):
    event = api_event(route, body, auth=admin_auth(groups, sub), path=path, query=query)
    resp = admin.lambda_handler(event, None)
    return resp["statusCode"], json.loads(resp["body"])


def invite(admin, email="pat@school.org", role="instructor", **extra):
    return call(admin, "POST /v1/admin/users", {"email": email, "name": "Pat", "role": role, **extra})


ROUTES = [("GET /v1/admin/users", None, None), ("POST /v1/admin/users", {"email": "a@b.co", "name": "x", "role": "reviewer"}, None),
          ("PATCH /v1/admin/users/{userId}", {"enabled": False}, {"userId": "user-0000001"})]


@pytest.mark.parametrize("route,body,path", ROUTES)
@pytest.mark.parametrize("groups", ["[instructor]", "[reviewer]", ""])
def test_non_admins_are_forbidden(admin, route, body, path, groups):
    assert call(admin, route, body, groups=groups, path=path)[0] == 403


def test_invite_creates_user_with_group_and_flag(admin, pool, table):
    status, body = invite(admin, canAuthor=True)
    assert status == 201
    user = body["data"]
    assert user["role"] == "instructor" and user["canAuthor"] is True and user["email"] == "pat@school.org"
    client, pid = pool
    groups = client.admin_list_groups_for_user(UserPoolId=pid, Username="pat@school.org")["Groups"]
    assert [g["GroupName"] for g in groups] == ["instructor"]
    assert table.get_item(Key={"pk": f"USR#{user['userId']}", "sk": "META"})["Item"]["canAuthor"] is True


def test_duplicate_email_is_conflict(admin):
    invite(admin)
    assert invite(admin, "PAT@school.org")[0] == 409


@pytest.mark.parametrize("body", [
    {"email": "nope", "name": "x", "role": "reviewer"},
    {"email": "a@b.co", "name": "", "role": "reviewer"},
    {"email": "a@b.co", "name": "x", "role": "root"},
    {"email": "a@b.co", "name": "x"},
    {"email": "a@b.co", "name": "x", "role": "reviewer", "canAuthor": True},
    {"email": "a@b.co", "name": "x", "role": "instructor", "canAuthor": "yes"},
    {"email": "a@b.co", "name": "x", "role": "reviewer", "isAdmin": True},
])
def test_invite_validation(admin, body):
    assert call(admin, "POST /v1/admin/users", body)[0] == 400


def test_list_shows_role_and_can_author(admin):
    invite(admin, "i@school.org", "instructor", canAuthor=True)
    invite(admin, "r@school.org", "reviewer")
    invite(admin, "a@cic.org", "cic_admin")
    status, body = call(admin, "GET /v1/admin/users")
    got = {u["email"]: (u["role"], u["canAuthor"]) for u in body["data"]}
    assert status == 200
    assert got == {"i@school.org": ("instructor", True), "r@school.org": ("reviewer", False),
                   "a@cic.org": ("cic_admin", True)}


def test_list_validates_limit(admin):
    assert call(admin, "GET /v1/admin/users", query={"limit": "61"})[0] == 400


def patch(admin, user_id, body, **kw):
    return call(admin, "PATCH /v1/admin/users/{userId}", body, path={"userId": user_id}, **kw)


def test_change_role_moves_group_and_clears_can_author(admin, pool):
    user = invite(admin, canAuthor=True)[1]["data"]
    status, body = patch(admin, user["userId"], {"role": "reviewer"})
    assert status == 200 and body["data"]["role"] == "reviewer" and body["data"]["canAuthor"] is False
    client, pid = pool
    groups = client.admin_list_groups_for_user(UserPoolId=pid, Username=user["userId"])["Groups"]
    assert [g["GroupName"] for g in groups] == ["reviewer"]


def test_set_can_author_only_for_instructors(admin):
    reviewer = invite(admin, "r@school.org", "reviewer")[1]["data"]
    assert patch(admin, reviewer["userId"], {"canAuthor": True})[0] == 400
    instructor = invite(admin, "i@school.org", "instructor")[1]["data"]
    assert patch(admin, instructor["userId"], {"canAuthor": True})[1]["data"]["canAuthor"] is True


def test_disable_and_enable(admin):
    user = invite(admin)[1]["data"]
    assert patch(admin, user["userId"], {"enabled": False})[1]["data"]["enabled"] is False
    assert patch(admin, user["userId"], {"enabled": True})[1]["data"]["enabled"] is True


def test_admin_cannot_demote_or_disable_self(admin):
    me = invite(admin, "me@cic.org", "cic_admin")[1]["data"]["userId"]
    for body in ({"enabled": False}, {"role": "instructor"}):
        assert patch(admin, me, body, sub=me)[0] == 400


def test_unknown_user_and_bad_ids_are_404(admin):
    assert patch(admin, "00000000-0000-0000-0000-000000000000", {"enabled": False})[0] == 404
    assert patch(admin, "../etc", {"enabled": False})[0] == 404


@pytest.mark.parametrize("body", [{}, {"role": "root"}, {"enabled": "no"}, {"admin": True}])
def test_patch_validation(admin, body):
    user = invite(admin)[1]["data"]
    assert patch(admin, user["userId"], body)[0] == 400


def test_half_created_user_is_rolled_back(admin, pool, monkeypatch):
    client, pid = pool
    import admin_users
    def boom(**kwargs):
        raise RuntimeError("group add failed")
    real = admin_users.cognito()
    monkeypatch.setattr(real, "admin_add_user_to_group", boom)
    assert invite(admin)[0] == 500
    assert client.list_users(UserPoolId=pid)["Users"] == []


@pytest.fixture
def schools(table):
    table.put_item(Item={"pk": "ORG#org_1", "sk": "META", "status": "active"})
    table.put_item(Item={"pk": "ORG#org_2", "sk": "META", "status": "active"})
    table.put_item(Item={"pk": "ORG#org_old", "sk": "META", "status": "archived"})


def test_invite_with_a_school_and_list_shows_it(admin, table, schools):
    status, body = invite(admin, orgId="org_1", canAuthor=True)
    assert status == 201 and body["data"]["orgId"] == "org_1"
    profile = table.get_item(Key={"pk": f"USR#{body['data']['userId']}", "sk": "META"})["Item"]
    assert profile["orgId"] == "org_1" and profile["canAuthor"] is True
    listed = call(admin, "GET /v1/admin/users")[1]["data"]
    assert listed[0]["orgId"] == "org_1"
    assert invite(admin, "b@school.org")[1]["data"]["orgId"] is None  # a school is optional


@pytest.mark.parametrize("org", ["org_missing", "org_old", "a#b", 5])
def test_invite_rejects_unknown_or_archived_schools(admin, schools, org):
    assert invite(admin, orgId=org)[0] == 400


def test_change_and_clear_school_keeps_can_author(admin, table, schools):
    user = invite(admin, orgId="org_1", canAuthor=True)[1]["data"]
    status, body = patch(admin, user["userId"], {"orgId": "org_2"})
    assert status == 200 and body["data"]["orgId"] == "org_2" and body["data"]["canAuthor"] is True
    body = patch(admin, user["userId"], {"orgId": None})[1]
    assert body["data"]["orgId"] is None
    profile = table.get_item(Key={"pk": f"USR#{user['userId']}", "sk": "META"})["Item"]
    assert "orgId" not in profile and profile["canAuthor"] is True
    assert patch(admin, user["userId"], {"orgId": "org_old"})[0] == 400


def test_changing_can_author_keeps_the_school(admin, table, schools):
    user = invite(admin, orgId="org_1")[1]["data"]
    assert patch(admin, user["userId"], {"canAuthor": True})[1]["data"]["orgId"] == "org_1"
