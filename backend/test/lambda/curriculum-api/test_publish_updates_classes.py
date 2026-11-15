import json

import boto3
import pytest
from support import api_event
from test_publish import PATH, PUBLISH, fill, save

ADMIN = ("[cic_admin]", "adm-1")
INS = ("[instructor]", "ins-1")


def call(api, route, body=None, who=ADMIN, path=PATH):
    auth = {"jwt": {"claims": {"sub": who[1], "cognito:groups": who[0]}}}
    resp = api.lambda_handler(api_event(route, body, auth=auth, path=path), None)
    return resp["statusCode"], json.loads(resp["body"])


@pytest.fixture
def v1(api, table):
    created = call(api, "POST /v1/curriculum/modules", {"title": "Python Loops"}, path=None)[1]["data"]
    doc = fill({k: v for k, v in created.items() if k not in ("revision", "draft")})
    save(api, doc, 1)
    assert call(api, PUBLISH)[0] == 201
    for cid in ("cls_mine", "cls_other"):
        table.put_item(Item={"pk": f"CLS#{cid}", "sk": "ASG#0001#python-loops", "moduleId": "python-loops", "moduleVersion": 1, "order": 1})
    table.put_item(Item={"pk": "CLS#cls_mine", "sk": "INS#ins-1"})
    table.put_item(Item={"pk": "USR#ins-1", "sk": "META", "canAuthor": True})
    doc["title"] = "Python Loops v2"
    save(api, doc, 2)
    return doc


def version_of(table, cid):
    return int(table.get_item(Key={"pk": f"CLS#{cid}", "sk": "ASG#0001#python-loops"})["Item"]["moduleVersion"])


def test_publishing_moves_classes_by_default(api, table, v1):
    status, body = call(api, PUBLISH)
    assert status == 201 and body["data"]["version"] == 2 and body["data"]["classesUpdated"] == 2
    assert version_of(table, "cls_mine") == version_of(table, "cls_other") == 2


def test_an_instructor_only_moves_their_own_classes(api, table, v1):
    status, body = call(api, PUBLISH, who=INS)
    assert status == 201 and body["data"]["classesUpdated"] == 1
    assert (version_of(table, "cls_mine"), version_of(table, "cls_other")) == (2, 1)


def test_classes_can_be_left_alone(api, table, v1):
    status, body = call(api, PUBLISH, {"updateClasses": False})
    assert status == 201 and body["data"]["classesUpdated"] == 0
    assert version_of(table, "cls_mine") == 1
    assert call(api, PUBLISH, {"updateClasses": "yes"})[0] in (400, 409)
