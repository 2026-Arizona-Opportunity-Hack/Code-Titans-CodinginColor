import json
import time

import pytest
from support import admin_auth, api_event, load_lambda

KEYS, ONE, AUDIT = "/v1/admin/api-keys", "/v1/admin/api-keys/{keyId}", "/v1/admin/audit"


@pytest.fixture
def admin(tables):
    mod = load_lambda("admin-api")

    def call(route, body=None, auth=None, path=None, query=None):
        resp = mod.lambda_handler(api_event(route, body, auth=auth or admin_auth(), path=path, query=query), None)
        return resp["statusCode"], json.loads(resp["body"])
    return call


def create(admin, label="CIC dashboard", scopes=("read:cohorts",), **kw):
    return admin(f"POST {KEYS}", {"label": label, "scopes": list(scopes)}, **kw)


def test_created_key_is_shown_once_and_stored_only_as_a_hash(admin, tables):
    status, body = create(admin)
    data = body["data"]
    assert status == 201 and data["key"].startswith("cic_") and data["scopes"] == ["read:cohorts"] and data["revoked"] is False
    secret = data["key"].split("_", 2)[2]
    stored = json.dumps(tables["CORE_TABLE"].get_item(Key={"pk": f"KEY#{data['keyId']}", "sk": "META"})["Item"], default=str)
    assert secret not in stored and "secretHash" in stored
    _, listed = admin(f"GET {KEYS}")
    assert [k["keyId"] for k in listed["data"]] == [data["keyId"]] and secret not in json.dumps(listed)


def test_a_key_made_here_works_with_the_authorizer_and_stops_when_revoked(admin, tables):
    key = create(admin)[1]["data"]
    authorizer = load_lambda("authorizer-apikey")
    check = lambda: authorizer.lambda_handler({"headers": {"x-api-key": key["key"]}}, None)  # noqa: E731
    assert check() == {"isAuthorized": True, "context": {"keyId": key["keyId"], "scopes": "read:cohorts"}}
    status, body = admin(f"DELETE {ONE}", path={"keyId": key["keyId"]})
    assert status == 200 and body["data"]["revoked"] is True
    assert check() == {"isAuthorized": False}
    assert admin(f"DELETE {ONE}", path={"keyId": key["keyId"]})[0] == 200  # revoking twice is harmless
    assert admin(f"DELETE {ONE}", path={"keyId": "nosuchkey123"})[0] == 404
    assert admin(f"DELETE {ONE}", path={"keyId": "a#b"})[0] == 404


def test_only_admins_manage_keys(admin):
    for who in ("[instructor]", "[reviewer]"):
        auth = admin_auth(who, "u1")
        assert admin(f"GET {KEYS}", auth=auth)[0] == 403
        assert create(admin, auth=auth)[0] == 403
        assert admin(f"DELETE {ONE}", auth=auth, path={"keyId": "abcdefabcdef"})[0] == 403
        assert admin(f"GET {AUDIT}", auth=auth)[0] == 403


@pytest.mark.parametrize("body", [{}, {"label": "x"}, {"label": "x", "scopes": []}, {"label": "x", "scopes": ["write:all"]},
                                  {"label": "", "scopes": ["read:cohorts"]}, {"label": "x", "scopes": ["read:cohorts"], "extra": 1}])
def test_create_validation(admin, body):
    assert admin(f"POST {KEYS}", body)[0] == 400


def test_active_keys_are_capped_but_revoked_ones_do_not_count(admin):
    ids = [create(admin, f"key {i}")[1]["data"]["keyId"] for i in range(10)]
    assert create(admin, "eleventh")[0] == 400
    admin(f"DELETE {ONE}", path={"keyId": ids[0]})
    assert create(admin, "replacement")[0] == 201


def test_audit_lists_key_changes_newest_first_and_never_the_secret(admin):
    key = create(admin, "dashboard")[1]["data"]
    admin(f"DELETE {ONE}", path={"keyId": key["keyId"]})
    status, body = admin(f"GET {AUDIT}")
    entries = body["data"]
    assert status == 200 and [e["action"] for e in entries] == ["api_key_revoked", "api_key_created"]
    assert entries[1]["details"] == {"keyId": key["keyId"], "label": "dashboard"} and entries[0]["actor"] == "admin-1"
    assert "secret" not in json.dumps(body).lower() and key["key"] not in json.dumps(body)


def test_audit_range_and_limits(admin, tables):
    create(admin)
    today = time.strftime("%Y-%m-%d", time.gmtime())
    assert len(admin(f"GET {AUDIT}", query={"from": today, "to": today})[1]["data"]) == 1
    assert admin(f"GET {AUDIT}", query={"from": "2020-01-01", "to": "2020-01-31"})[1]["data"] == []
    assert len(admin(f"GET {AUDIT}", query={"limit": "1"})[1]["data"]) == 1
    for q in ({"from": "yesterday"}, {"from": "2026-02-01", "to": "2026-01-01"}, {"from": "2020-01-01", "to": "2026-01-01"}, {"limit": "0"}):
        assert admin(f"GET {AUDIT}", query=q)[0] == 400
