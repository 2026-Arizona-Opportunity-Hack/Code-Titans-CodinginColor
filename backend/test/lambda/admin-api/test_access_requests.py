"""External teachers ask for an account (public route), and an admin approves or denies."""
import json
import os
import boto3
import pytest
from support import admin_auth, api_event, load_lambda
PUBLIC = "POST /v1/auth/external/request-access"
FORM = {"name": "Pat Lee", "email": "Pat@Desert.Org", "organization": "Desert Prep", "note": "Grade 9 CS"}
@pytest.fixture
def pool(tables):  # one moto session for Cognito and all four tables
    client = boto3.client("cognito-idp")
    pid = client.create_user_pool(PoolName="staff", UsernameAttributes=["email"])["UserPool"]["Id"]
    for group in ("cic_admin", "instructor", "external_teacher", "reviewer"):
        client.create_group(UserPoolId=pid, GroupName=group)
    os.environ["USER_POOL_ID"] = pid
    return client, pid
@pytest.fixture
def apis(pool, tables):
    public, admin_api = load_lambda("access-request"), load_lambda("admin-api")
    import admin_users
    admin_users._client = None
    return public, admin_api
def send(api, route, body=None, groups=None, sub="adm-1", path=None, query=None):
    auth = admin_auth(groups, sub) if groups else None
    resp = api.lambda_handler(api_event(route, body, auth=auth, path=path, query=query), None)
    return resp["statusCode"], json.loads(resp["body"])
def ask(apis, **change):
    return send(apis[0], PUBLIC, {**FORM, **change})
def admin(apis, route, body=None, path=None, query=None, groups="[cic_admin]"):
    return send(apis[1], route, body, groups, path=path, query=query)
def pending(apis):
    return admin(apis, "GET /v1/admin/access-requests")[1]["data"]
def test_request_is_stored_and_the_answer_does_not_depend_on_the_email(apis):
    assert ask(apis) == (202, {"data": {"received": True}})
    assert ask(apis, name="Someone Else", email="pat@desert.org") == (202, {"data": {"received": True}})  # already asked
    rows = pending(apis)
    assert len(rows) == 1 and rows[0]["email"] == "pat@desert.org" and rows[0]["name"] == "Pat Lee"
    assert rows[0]["status"] == "pending" and rows[0]["organization"] == "Desert Prep"
@pytest.mark.parametrize("change", [{"email": "nope"}, {"name": ""}, {"organization": ""}, {"name": "x" * 101},
                                    {"note": "x" * 501}, {"role": "cic_admin"}, {"status": "approved"}])
def test_bad_requests_are_refused(apis, change):
    assert ask(apis, **change)[0] == 400
    assert pending(apis) == []
def test_pending_requests_are_capped(apis, monkeypatch):
    from cic import access_requests
    monkeypatch.setattr(access_requests, "MAX_PENDING", 2)
    assert ask(apis, email="a@x.org")[0] == 202 and ask(apis, email="b@x.org")[0] == 202
    assert ask(apis, email="c@x.org")[0] == 429
def test_only_admins_manage_requests(apis):
    ask(apis)
    request_id = pending(apis)[0]["requestId"]
    for groups in ("[instructor]", "[external_teacher]", "[reviewer]"):
        assert admin(apis, "GET /v1/admin/access-requests", groups=groups)[0] == 403
        for action in ("approve", "deny"):
            assert admin(apis, f"POST /v1/admin/access-requests/{{requestId}}/{action}", {}, {"requestId": request_id}, groups=groups)[0] == 403
def test_approving_invites_an_external_teacher_in_a_new_external_school(apis, pool, tables):
    table = tables["CORE_TABLE"]
    client, pid = pool
    ask(apis)
    request_id = pending(apis)[0]["requestId"]
    status, body = admin(apis, "POST /v1/admin/access-requests/{requestId}/approve", None, {"requestId": request_id})
    assert status == 200 and body["data"]["status"] == "approved"
    org_id = body["data"]["orgId"]
    org = table.get_item(Key={"pk": f"ORG#{org_id}", "sk": "META"})["Item"]
    assert org["kind"] == "external" and org["name"] == "Desert Prep" and org["status"] == "active"
    groups = client.admin_list_groups_for_user(UserPoolId=pid, Username="pat@desert.org")["Groups"]
    assert [g["GroupName"] for g in groups] == ["external_teacher"]
    sub = next(a["Value"] for a in client.admin_get_user(UserPoolId=pid, Username="pat@desert.org")["UserAttributes"] if a["Name"] == "sub")
    assert table.get_item(Key={"pk": f"USR#{sub}", "sk": "META"})["Item"]["orgId"] == org_id
    assert pending(apis) == []
    assert [r["requestId"] for r in admin(apis, "GET /v1/admin/access-requests", query={"status": "approved"})[1]["data"]] == [request_id]
    # The invited teacher can now create a class in their school.
    classes = load_lambda("class-api")
    import classes as classes_module
    classes_module._cognito = None
    resp = classes.lambda_handler(api_event("POST /v1/classes", {"name": "Intro CS"}, auth=admin_auth("[external_teacher]", sub)), None)
    assert resp["statusCode"] == 201 and json.loads(resp["body"])["data"]["ownerKind"] == "external"
def test_approving_into_an_existing_external_school(apis, tables):
    table = tables["CORE_TABLE"]
    table.put_item(Item={"pk": "ORG#org_ext", "sk": "META", "name": "Desert Prep", "status": "active", "kind": "external"})
    table.put_item(Item={"pk": "ORG#org_cic", "sk": "META", "name": "Maryvale", "status": "active"})
    ask(apis)
    path = {"requestId": pending(apis)[0]["requestId"]}
    route = "POST /v1/admin/access-requests/{requestId}/approve"
    assert admin(apis, route, {"orgId": "org_cic"}, path)[0] == 400  # a CIC school is not allowed
    assert admin(apis, route, {"orgId": "org_ext"}, path)[1]["data"]["orgId"] == "org_ext"
    assert len(pending(apis)) == 0
def test_a_request_is_decided_once(apis):
    ask(apis)
    path = {"requestId": pending(apis)[0]["requestId"]}
    assert admin(apis, "POST /v1/admin/access-requests/{requestId}/deny", None, path)[1]["data"]["status"] == "denied"
    assert admin(apis, "POST /v1/admin/access-requests/{requestId}/approve", None, path)[0] == 409
    assert admin(apis, "POST /v1/admin/access-requests/{requestId}/deny", None, path)[0] == 409
    assert ask(apis)[0] == 202 and pending(apis) == []  # a denied email cannot queue again
def test_failed_invite_leaves_no_school_and_the_request_stays_pending(apis, pool, tables):
    table = tables["CORE_TABLE"]
    client, pid = pool
    client.admin_create_user(UserPoolId=pid, Username="pat@desert.org")  # the account already exists
    ask(apis)
    path = {"requestId": pending(apis)[0]["requestId"]}
    assert admin(apis, "POST /v1/admin/access-requests/{requestId}/approve", None, path)[0] == 409
    assert len(pending(apis)) == 1
    assert [i for i in table.scan()["Items"] if i["pk"].startswith("ORG#")] == []
def test_unknown_request_ids(apis):
    for rid in ("req_000000000000", "bad", "req_zzzzzzzzzzzz"):
        assert admin(apis, "POST /v1/admin/access-requests/{requestId}/approve", None, {"requestId": rid})[0] == 404
def test_approval_is_in_the_audit_log(apis, tables):
    ask(apis)
    admin(apis, "POST /v1/admin/access-requests/{requestId}/approve", None, {"requestId": pending(apis)[0]["requestId"]})
    entries = admin(apis, "GET /v1/admin/audit")[1]["data"]
    assert [e["action"] for e in entries] == ["access_request_approved"]
    assert "pat@desert.org" not in json.dumps(entries)
