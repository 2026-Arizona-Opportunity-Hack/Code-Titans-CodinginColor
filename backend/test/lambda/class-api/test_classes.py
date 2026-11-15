import json
import os

import boto3
import pytest
from moto import mock_aws
from support import api_event, load_lambda

ADMIN = ("[cic_admin]", "adm-1")
INS = ("[instructor]", "ins-1")
INS2 = ("[instructor]", "ins-2")
REV = ("[reviewer]", "rev-1")


def call(api, route, body=None, who=ADMIN, path=None, query=None):
    auth = {"jwt": {"claims": {"sub": who[1], "cognito:groups": who[0]}}}
    resp = api.lambda_handler(api_event(route, body, auth=auth, path=path, query=query), None)
    return resp["statusCode"], json.loads(resp["body"])


def make(api, who=INS, **extra):
    return call(api, "POST /v1/classes", {"name": "Period 3", "orgId": "org_1", **extra}, who=who)


def test_create_class_makes_creator_a_member_and_code_resolves(api, table):
    status, body = make(api)
    data = body["data"]
    assert status == 201 and len(data["joinCode"]) == 6 and data["status"] == "active"
    cid = data["classId"]
    assert table.get_item(Key={"pk": f"CLS#{cid}", "sk": "INS#ins-1"})["Item"]["gsi1pk"] == "USR#ins-1"
    from cic.identity import find_class_by_code
    assert find_class_by_code(data["joinCode"])["pk"] == f"CLS#{cid}"
    assert table.get_item(Key={"pk": f"JOIN#{data['joinCode']}", "sk": "META"})["Item"]["classId"] == cid


def test_create_class_with_cohort_and_term(api, table):
    _, body = make(api, cohortId="coh_1", termStart="2026-09-01", termEnd="2026-12-15")
    cid = body["data"]["classId"]
    assert body["data"]["cohortId"] == "coh_1"
    assert table.get_item(Key={"pk": f"CLS#{cid}", "sk": "META"})["Item"]["gsi2pk"] == "COH#coh_1"


@pytest.mark.parametrize("extra", [
    {"orgId": "org_missing"}, {"orgId": "org_old"}, {"orgId": "bad#id"}, {"cohortId": "coh_none"},
    {"termStart": "2026-13-01"}, {"termStart": "2026-12-01", "termEnd": "2026-09-01"},
    {"name": ""}, {"surprise": 1}])
def test_create_validation(api, extra):
    assert make(api, who=ADMIN, **extra)[0] == 400  # admins pick the school, so its checks apply


def test_reviewer_cannot_create_or_list(api):
    assert make(api, who=REV)[0] == 403
    assert call(api, "GET /v1/classes", who=REV)[0] == 403


def test_instructor_lists_only_their_classes(api):
    a = make(api, who=INS)[1]["data"]["classId"]
    make(api, who=INS2)
    _, body = call(api, "GET /v1/classes", who=INS)
    assert [c["classId"] for c in body["data"]] == [a]


def test_admin_lists_all_and_filters(api):
    make(api, who=INS)
    make(api, who=INS2, cohortId="coh_1")
    assert len(call(api, "GET /v1/classes")[1]["data"]) == 2
    assert len(call(api, "GET /v1/classes", query={"cohortId": "coh_1"})[1]["data"]) == 1
    assert len(call(api, "GET /v1/classes", query={"orgId": "org_1"})[1]["data"]) == 2
    assert len(call(api, "GET /v1/classes", query={"orgId": "nope"})[1]["data"]) == 0


def test_detail_has_counts_and_blocks_other_instructors(api, table):
    cid = make(api, who=INS)[1]["data"]["classId"]
    table.put_item(Item={"pk": f"CLS#{cid}", "sk": "STU#stu_1"})
    path = {"classId": cid}
    status, body = call(api, "GET /v1/classes/{classId}", who=INS, path=path)
    assert status == 200 and body["data"]["counts"] == {"students": 1} and body["data"]["assignments"] == []
    assert call(api, "GET /v1/classes/{classId}", who=INS2, path=path)[0] == 403
    assert call(api, "GET /v1/classes/{classId}", who=REV, path=path)[0] == 403
    assert call(api, "GET /v1/classes/{classId}", who=ADMIN, path=path)[0] == 200
    assert call(api, "GET /v1/classes/{classId}", who=ADMIN, path={"classId": "cls_nope"})[0] == 404
    assert call(api, "GET /v1/classes/{classId}", who=ADMIN, path={"classId": "a#b"})[0] == 404


def test_patch_rename_archive_module_and_settings(api):
    cid = make(api)[1]["data"]["classId"]
    patch = lambda body, who=INS: call(api, "PATCH /v1/classes/{classId}", body, who=who, path={"classId": cid})
    _, body = patch({"name": "Period 4", "status": "archived", "currentModuleId": "py-loops",
                     "settings": {"stuckFailedAttempts": 5}})
    data = body["data"]
    assert data["name"] == "Period 4" and data["status"] == "archived" and data["currentModuleId"] == "py-loops"
    assert data["settings"]["stuckFailedAttempts"] == 5 and data["settings"]["notStartedDays"] == 1
    assert patch({"settings": {"notStartedDays": 2}})[1]["data"]["settings"]["stuckFailedAttempts"] == 5


@pytest.mark.parametrize("body", [
    {}, {"currentModuleId": "no-such-module"}, {"status": "deleted"}, {"settings": {"stuckFailedAttempts": 0}},
    {"settings": {"bogus": 1}}, {"settings": {"notStartedDays": True}}, {"settings": []}, {"joinCode": "AAAAAA"}])
def test_patch_validation(api, body):
    cid = make(api)[1]["data"]["classId"]
    assert call(api, "PATCH /v1/classes/{classId}", body, who=INS, path={"classId": cid})[0] == 400


def test_patch_other_instructor_forbidden_and_unknown_class_404(api):
    cid = make(api, who=INS)[1]["data"]["classId"]
    assert call(api, "PATCH /v1/classes/{classId}", {"name": "x"}, who=INS2, path={"classId": cid})[0] == 403
    assert call(api, "PATCH /v1/classes/{classId}", {"name": "x"}, path={"classId": "cls_nope"})[0] == 404


@pytest.fixture
def pool(api):
    client = boto3.client("cognito-idp")
    pid = client.create_user_pool(PoolName="staff", UsernameAttributes=["email"])["UserPool"]["Id"]
    for g in ("instructor", "reviewer"):
        client.create_group(UserPoolId=pid, GroupName=g)
    os.environ["USER_POOL_ID"] = pid

    def user(email, group):
        u = client.admin_create_user(UserPoolId=pid, Username=email,
                                     UserAttributes=[{"Name": "email", "Value": email}])["User"]
        client.admin_add_user_to_group(UserPoolId=pid, Username=email, GroupName=group)
        return {a["Name"]: a["Value"] for a in u["Attributes"]}["sub"]
    return user


def test_admin_adds_instructor_who_then_sees_the_class(api, pool):
    cid = make(api, who=INS)[1]["data"]["classId"]
    sub = pool("t@school.org", "instructor")
    status, _ = call(api, "POST /v1/classes/{classId}/members", {"userId": sub}, path={"classId": cid})
    assert status == 201
    listed = call(api, "GET /v1/classes", who=("[instructor]", sub))[1]["data"]
    assert [c["classId"] for c in listed] == [cid]


def test_add_member_rules(api, pool):
    cid = make(api)[1]["data"]["classId"]
    path = {"classId": cid}
    reviewer = pool("r@school.org", "reviewer")
    add = lambda body, who=ADMIN, p=path: call(api, "POST /v1/classes/{classId}/members", body, who=who, path=p)
    assert add({"userId": reviewer})[0] == 400                      # not an instructor
    assert add({"userId": "00000000-0000-0000-0000-000000000000"})[0] == 400  # unknown user
    assert add({"userId": "x#y"})[0] == 400
    assert add({"userId": reviewer}, who=INS)[0] == 403              # admin only
    assert add({"userId": reviewer}, p={"classId": "cls_nope"})[0] == 404


def test_instructor_classes_go_in_their_assigned_school(api, table):
    status, body = call(api, "POST /v1/classes", {"name": "Period 5"}, who=INS)  # no orgId sent
    assert status == 201 and body["data"]["orgId"] == "org_1"
    assert make(api, who=INS)[0] == 201  # sending their own school is fine too
    table.put_item(Item={"pk": "ORG#org_2", "sk": "META", "status": "active"})
    status, body = call(api, "POST /v1/classes", {"name": "x", "orgId": "org_2"}, who=INS)
    assert status == 403 and "own school" in body["error"]


def test_instructor_without_a_school_cannot_create_classes(api, table):
    who = ("[instructor]", "ins-new")
    status, body = call(api, "POST /v1/classes", {"name": "x", "orgId": "org_1"}, who=who)
    assert status == 403 and "no school" in body["error"]


def test_admins_still_choose_any_school(api, table):
    table.put_item(Item={"pk": "ORG#org_2", "sk": "META", "status": "active"})
    assert make(api, who=ADMIN, orgId="org_2")[1]["data"]["orgId"] == "org_2"
    assert call(api, "POST /v1/classes", {"name": "x"}, who=ADMIN)[0] == 400  # admins must say which school


def test_classes_list_their_instructors_by_name(api, table):
    claims = lambda sub, name: {"jwt": {"claims": {"sub": sub, "cognito:groups": "[instructor]", "name": name}}}
    from support import api_event as ev
    resp = api.lambda_handler(ev("POST /v1/classes", {"name": "Period 6"}, auth=claims("ins-1", "Pat Lee")), None)
    created = json.loads(resp["body"])["data"]
    assert created["instructors"] == [{"userId": "ins-1", "name": "Pat Lee"}]
    cid = created["classId"]
    listed = call(api, "GET /v1/classes", who=INS)[1]["data"]
    assert listed[0]["instructors"] == [{"userId": "ins-1", "name": "Pat Lee"}]
    assert call(api, "GET /v1/classes", who=ADMIN)[1]["data"][0]["instructors"][0]["name"] == "Pat Lee"
    assert call(api, "GET /v1/classes/{classId}", who=INS, path={"classId": cid})[1]["data"]["instructors"][0]["name"] == "Pat Lee"


def test_older_memberships_get_the_name_from_cognito(api, pool, table):
    sub = pool("t@school.org", "instructor")
    boto3.client("cognito-idp").admin_update_user_attributes(
        UserPoolId=os.environ["USER_POOL_ID"], Username="t@school.org", UserAttributes=[{"Name": "name", "Value": "Sam Ortiz"}])
    cid = make(api)[1]["data"]["classId"]
    table.put_item(Item={"pk": f"CLS#{cid}", "sk": f"INS#{sub}", "gsi1pk": f"USR#{sub}", "gsi1sk": f"CLS#{cid}"})  # no name stored
    table.put_item(Item={"pk": f"CLS#{cid}", "sk": "INS#gone-user", "gsi1pk": "USR#gone-user", "gsi1sk": f"CLS#{cid}"})
    names = {i["userId"]: i["name"] for i in call(api, "GET /v1/classes/{classId}", who=ADMIN, path={"classId": cid})[1]["data"]["instructors"]}
    assert names[sub] == "Sam Ortiz" and names["gone-user"] == "Former instructor"


def test_adding_an_instructor_stores_their_name(api, pool, table):
    cid = make(api)[1]["data"]["classId"]
    sub = pool("n@school.org", "instructor")
    call(api, "POST /v1/classes/{classId}/members", {"userId": sub}, path={"classId": cid})
    assert table.get_item(Key={"pk": f"CLS#{cid}", "sk": f"INS#{sub}"})["Item"]["name"] == "n@school.org"
