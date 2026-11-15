import json

import boto3
import pytest
from support import api_event

ADMIN = ("[cic_admin]", "adm-1")
INS = ("[instructor]", "ins-1")
REV = ("[reviewer]", "rev-1")
ROUTE = "GET /v1/curriculum/modules/{moduleId}/classes"


def call(api, who, module_id):
    auth = {"jwt": {"claims": {"sub": who[1], "cognito:groups": who[0]}}}
    resp = api.lambda_handler(api_event(ROUTE, auth=auth, path={"moduleId": module_id}), None)
    return resp["statusCode"], json.loads(resp["body"])


@pytest.fixture
def setup(api, table):
    mid = json.loads(api.lambda_handler(api_event("POST /v1/curriculum/modules", {"title": "Loops"},
                     auth={"jwt": {"claims": {"sub": "adm-1", "cognito:groups": "[cic_admin]"}}}), None)["body"])["data"]["moduleId"]
    boto3.resource("dynamodb").Table("content").update_item(Key={"pk": f"MOD#{mid}", "sk": "META"},
        UpdateExpression="SET latestVersion = :v", ExpressionAttributeValues={":v": 3})
    for cid, name, version in (("cls_a", "Period 1", 1), ("cls_b", "Period 2", 3)):
        table.put_item(Item={"pk": f"CLS#{cid}", "sk": "META", "name": name})
        table.put_item(Item={"pk": f"CLS#{cid}", "sk": f"ASG#0001#{mid}", "moduleId": mid, "moduleVersion": version, "order": 1})
    table.put_item(Item={"pk": "CLS#cls_a", "sk": "INS#ins-1"})
    boto3.resource("dynamodb").Table("progress").put_item(
        Item={"pk": "STU#s1", "sk": f"MOD#{mid}", "gsi1pk": f"CLS#cls_a#MOD#{mid}", "gsi1sk": "STU#s1"})
    return mid


def test_admin_sees_every_class_with_its_pinned_version(api, setup):
    status, body = call(api, ADMIN, setup)
    assert status == 200 and body["data"]["latestVersion"] == 3
    assert body["data"]["classes"] == [
        {"classId": "cls_a", "name": "Period 1", "moduleVersion": 1, "startedCount": 1},
        {"classId": "cls_b", "name": "Period 2", "moduleVersion": 3, "startedCount": 0}]


def test_instructors_see_only_their_classes_and_reviewers_nothing(api, setup):
    assert [c["classId"] for c in call(api, INS, setup)[1]["data"]["classes"]] == ["cls_a"]
    assert call(api, REV, setup)[0] == 403
    assert call(api, ADMIN, "nope")[0] == 404
