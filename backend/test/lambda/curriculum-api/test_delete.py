import json

import boto3
import pytest
from support import api_event

ADMIN = ("[cic_admin]", "adm-1")
AUTHOR = ("[instructor]", "ins-author")
AUTHOR2 = ("[instructor]", "ins-author2")
INS = ("[instructor]", "ins-plain")
REV = ("[reviewer]", "rev-1")
ROUTE = "DELETE /v1/curriculum/modules/{moduleId}"


@pytest.fixture(autouse=True)
def authors(table):
    for sub in ("ins-author", "ins-author2"):
        table.put_item(Item={"pk": f"USR#{sub}", "sk": "META", "canAuthor": True})


def call(api, route, body=None, who=ADMIN, path=None):
    auth = {"jwt": {"claims": {"sub": who[1], "cognito:groups": who[0]}}}
    resp = api.lambda_handler(api_event(route, body, auth=auth, path=path), None)
    return resp["statusCode"], json.loads(resp["body"])


def create(api, title, who=ADMIN):
    return call(api, "POST /v1/curriculum/modules", {"title": title}, who=who)[1]["data"]["moduleId"]


def content_items(module_id):
    table = boto3.resource("dynamodb").Table("content")
    return [i for i in table.scan()["Items"] if i["pk"] == f"MOD#{module_id}"]


def test_delete_removes_meta_draft_and_every_version_and_is_audited(api):
    mid = create(api, "Old Module")
    content = boto3.resource("dynamodb").Table("content")
    for v in (1, 2):
        content.put_item(Item={"pk": f"MOD#{mid}", "sk": f"V#{v:04d}", "module": {}})
    content.update_item(Key={"pk": f"MOD#{mid}", "sk": "META"}, UpdateExpression="SET latestVersion = :v",
                        ExpressionAttributeValues={":v": 2})
    assert len(content_items(mid)) == 4
    status, body = call(api, ROUTE, path={"moduleId": mid})
    assert status == 200 and body["data"] == {"moduleId": mid, "deleted": True}
    assert content_items(mid) == []
    audit = boto3.resource("dynamodb").Table("events").scan()["Items"]
    assert [(a["action"], a["details"]["moduleId"]) for a in audit] == [("module_deleted", mid)]
    assert call(api, ROUTE, path={"moduleId": mid})[0] == 404


def test_a_module_assigned_to_a_class_cannot_be_deleted(api, table):
    mid = create(api, "In Use")
    for cls in ("cls_1", "cls_2"):
        table.put_item(Item={"pk": f"CLS#{cls}", "sk": f"ASG#0001#{mid}", "moduleId": mid, "moduleVersion": 1, "order": 1})
    status, body = call(api, ROUTE, path={"moduleId": mid})
    assert status == 409 and body["code"] == "MODULE_IN_USE" and body["details"] == {"classCount": 2}
    assert "2 classes" in body["error"]
    assert len(content_items(mid)) == 2  # nothing deleted
    table.delete_item(Key={"pk": "CLS#cls_1", "sk": f"ASG#0001#{mid}"})
    table.delete_item(Key={"pk": "CLS#cls_2", "sk": f"ASG#0001#{mid}"})
    assert call(api, ROUTE, path={"moduleId": mid})[0] == 200


def test_a_similar_module_id_in_another_assignment_does_not_block(api, table):
    mid = create(api, "Loops")
    table.put_item(Item={"pk": "CLS#cls_1", "sk": "ASG#0001#loops-2", "moduleId": "loops-2", "moduleVersion": 1, "order": 1})
    assert call(api, ROUTE, path={"moduleId": mid})[0] == 200


def test_authoring_instructors_delete_only_their_own_modules(api):
    mine = create(api, "Mine", who=AUTHOR)
    theirs = create(api, "Theirs", who=AUTHOR2)
    admins = create(api, "Admins", who=ADMIN)
    assert call(api, ROUTE, who=AUTHOR, path={"moduleId": theirs})[0] == 403
    assert call(api, ROUTE, who=AUTHOR, path={"moduleId": admins})[0] == 403
    assert call(api, ROUTE, who=AUTHOR, path={"moduleId": mine})[0] == 200
    assert call(api, ROUTE, who=ADMIN, path={"moduleId": theirs})[0] == 200  # admins can delete anything


def test_authors_see_who_created_each_module(api):
    create(api, "Mine", who=AUTHOR)
    listed = api.lambda_handler(api_event("GET /v1/curriculum/modules", auth={"jwt": {"claims": {"sub": "ins-author", "cognito:groups": "[instructor]"}}},
                                          query={"status": "all"}), None)
    assert json.loads(listed["body"])["data"][0]["createdBy"] == "ins-author"
    plain = api.lambda_handler(api_event("GET /v1/curriculum/modules", auth={"jwt": {"claims": {"sub": "ins-plain", "cognito:groups": "[instructor]"}}}), None)
    assert all("createdBy" not in m for m in json.loads(plain["body"])["data"])


def test_plain_instructors_and_reviewers_cannot_delete(api):
    mid = create(api, "Keep Me")
    for who in (INS, REV):
        assert call(api, ROUTE, who=who, path={"moduleId": mid})[0] == 403
    assert len(content_items(mid)) == 2


def test_unknown_and_bad_ids_are_404(api):
    assert call(api, ROUTE, path={"moduleId": "nope"})[0] == 404
    assert call(api, ROUTE, path={"moduleId": "a#b"})[0] == 404
