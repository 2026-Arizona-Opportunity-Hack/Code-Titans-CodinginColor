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
    boto3.resource("dynamodb").Table("content").put_item(Item={"pk": "MOD#py-vars", "sk": "META", "latestVersion": 1})
    return call(api, "POST /v1/classes", {"name": "P3", "orgId": "org_1"})[1]["data"]["classId"]


def assign(api, cid, module="py-loops", who=INS, **extra):
    return call(api, "POST /v1/classes/{classId}/assignments", {"moduleId": module, **extra},
                who=who, path={"classId": cid})


def listing(api, cid):
    return call(api, "GET /v1/classes/{classId}/assignments", path={"classId": cid})[1]["data"]


def test_assign_pins_the_latest_published_version(api, cls):
    status, body = assign(api, cls, targetDate="2026-10-01")
    assert status == 201
    assert body["data"] == {"moduleId": "py-loops", "moduleVersion": 2, "order": 1, "targetDate": "2026-10-01", "startedCount": 0}
    boto3.resource("dynamodb").Table("content").update_item(
        Key={"pk": "MOD#py-loops", "sk": "META"}, UpdateExpression="SET latestVersion = :v",
        ExpressionAttributeValues={":v": 3})
    assert listing(api, cls)[0]["moduleVersion"] == 2  # a new publish does not change a running class


def test_order_defaults_to_next_and_list_is_sorted(api, cls):
    assign(api, cls, "py-loops")
    assign(api, cls, "py-vars", order=1)
    assert [(a["moduleId"], a["order"]) for a in listing(api, cls)] == [("py-loops", 1), ("py-vars", 1)]
    assert call(api, "PATCH /v1/classes/{classId}/assignments/{moduleId}", {"order": 5},
                path={"classId": cls, "moduleId": "py-vars"})[1]["data"]["order"] == 5
    assert [a["moduleId"] for a in listing(api, cls)] == ["py-loops", "py-vars"]
    assert len(listing(api, cls)) == 2  # reorder moved the item, it did not duplicate it


def test_assign_rules(api, cls):
    assert assign(api, cls)[0] == 201
    assert assign(api, cls)[0] == 409                 # already assigned
    assert assign(api, cls, "py-draft")[0] == 400     # never published
    assert assign(api, cls, "nope")[0] == 400
    assert assign(api, cls, "a#b")[0] == 400
    for extra in ({"order": 0}, {"order": "1"}, {"targetDate": "soon"}, {"x": 1}):
        assert assign(api, cls, "py-vars", **extra)[0] == 400


def test_started_count_comes_from_the_progress_class_index(api, cls):
    assign(api, cls)
    prog = boto3.resource("dynamodb").Table("progress")
    for sid in ("s1", "s2"):
        prog.put_item(Item={"pk": f"STU#{sid}", "sk": "MOD#py-loops", "gsi1pk": f"CLS#{cls}#MOD#py-loops", "gsi1sk": f"STU#{sid}"})
    assert listing(api, cls)[0]["startedCount"] == 2


def test_move_to_newer_version_rules(api, cls):
    assign(api, cls, "py-vars")  # version 1
    table = boto3.resource("dynamodb").Table("content")
    table.update_item(Key={"pk": "MOD#py-vars", "sk": "META"}, UpdateExpression="SET latestVersion = :v",
                      ExpressionAttributeValues={":v": 3})
    patch = lambda body, who=INS: call(api, "PATCH /v1/classes/{classId}/assignments/{moduleId}", body, who=who,
                                       path={"classId": cls, "moduleId": "py-vars"})
    assert patch({"moduleVersion": 1})[0] == 400      # not newer
    assert patch({"moduleVersion": 4})[0] == 400      # not published yet
    boto3.resource("dynamodb").Table("progress").put_item(
        Item={"pk": "STU#s1", "sk": "MOD#py-vars", "gsi1pk": f"CLS#{cls}#MOD#py-vars", "gsi1sk": "STU#s1"})
    assert patch({"moduleVersion": 2})[1]["data"]["moduleVersion"] == 2  # the class's instructor can, even after students start
    assert patch({"moduleVersion": 3}, who=ADMIN)[1]["data"]["moduleVersion"] == 3
    assert patch({"moduleVersion": 3}, who=INS2)[0] == 403   # not their class


def test_move_version_freely_when_nobody_started(api, cls):
    assign(api, cls)  # py-loops at 2, latest 2
    boto3.resource("dynamodb").Table("content").update_item(
        Key={"pk": "MOD#py-loops", "sk": "META"}, UpdateExpression="SET latestVersion = :v", ExpressionAttributeValues={":v": 3})
    out = call(api, "PATCH /v1/classes/{classId}/assignments/{moduleId}", {"moduleVersion": 3},
               path={"classId": cls, "moduleId": "py-loops"})
    assert out[1]["data"]["moduleVersion"] == 3


def test_target_date_set_and_cleared(api, cls):
    assign(api, cls)
    path = {"classId": cls, "moduleId": "py-loops"}
    patch = lambda body: call(api, "PATCH /v1/classes/{classId}/assignments/{moduleId}", body, path=path)
    assert patch({"targetDate": "2026-10-01"})[1]["data"]["targetDate"] == "2026-10-01"
    assert patch({"targetDate": None})[1]["data"]["targetDate"] is None
    for body in ({}, {"targetDate": None}, {"order": 1}, {"surprise": 1}):  # no-ops and unknown fields
        assert patch(body)[0] == 400


def test_unassign(api, cls):
    assign(api, cls)
    path = {"classId": cls, "moduleId": "py-loops"}
    assert call(api, "DELETE /v1/classes/{classId}/assignments/{moduleId}", path=path)[0] == 200
    assert listing(api, cls) == []
    assert call(api, "DELETE /v1/classes/{classId}/assignments/{moduleId}", path=path)[0] == 404
    assert call(api, "PATCH /v1/classes/{classId}/assignments/{moduleId}", {"order": 2}, path=path)[0] == 404


def test_class_detail_lists_assignments(api, cls):
    assign(api, cls)
    detail = call(api, "GET /v1/classes/{classId}", path={"classId": cls})[1]["data"]
    assert [a["moduleId"] for a in detail["assignments"]] == ["py-loops"]


def make_student(api, cid):
    return call(api, "POST /v1/classes/{classId}/roster", {"displayName": "Ana"}, path={"classId": cid})[1]["data"]["studentId"]


def test_unlock_override(api, cls, table):
    sid = make_student(api, cls)
    assign(api, cls)
    path = {"classId": cls, "studentId": sid}
    status, body = call(api, "POST /v1/classes/{classId}/students/{studentId}/unlock", {"moduleId": "py-loops"}, path=path)
    assert status == 200 and body["data"] == {"studentId": sid, "moduleId": "py-loops", "unlocked": True}
    item = table.get_item(Key={"pk": f"CLS#{cls}", "sk": f"OVR#{sid}#py-loops"})["Item"]
    assert item["unlockedBy"] == "ins-1"
    assert (item["studentId"], item["moduleId"]) == (sid, "py-loops")  # read as attributes by the player and reports
    assert call(api, "POST /v1/classes/{classId}/students/{studentId}/unlock", {"moduleId": "py-loops"}, path=path)[0] == 200  # idempotent


def test_unlock_validation(api, cls):
    sid = make_student(api, cls)
    assign(api, cls)
    unlock = lambda body, student=sid: call(api, "POST /v1/classes/{classId}/students/{studentId}/unlock", body,
                                            path={"classId": cls, "studentId": student})
    assert unlock({"moduleId": "py-vars"})[0] == 404    # not assigned to this class
    assert unlock({"moduleId": "py-loops"}, "ghost")[0] == 404
    assert unlock({})[0] == 400
    assert unlock({"moduleId": "py-loops", "x": 1})[0] == 400


def test_other_instructors_and_reviewers_are_refused(api, cls):
    sid = make_student(api, cls)
    assign(api, cls)
    for who in (INS2, REV):
        assert assign(api, cls, "py-vars", who=who)[0] == 403
        assert call(api, "GET /v1/classes/{classId}/assignments", who=who, path={"classId": cls})[0] == 403
        assert call(api, "DELETE /v1/classes/{classId}/assignments/{moduleId}", who=who,
                    path={"classId": cls, "moduleId": "py-loops"})[0] == 403
        assert call(api, "POST /v1/classes/{classId}/students/{studentId}/unlock", {"moduleId": "py-loops"}, who=who,
                    path={"classId": cls, "studentId": sid})[0] == 403
