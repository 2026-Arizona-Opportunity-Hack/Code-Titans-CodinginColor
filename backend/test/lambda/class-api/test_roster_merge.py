import json
import os
from decimal import Decimal

import boto3
import pytest
from boto3.dynamodb.conditions import Key
from support import api_event

ADMIN = ("[cic_admin]", "adm-1")
INS = ("[instructor]", "ins-1")
INS2 = ("[instructor]", "ins-2")
REV = ("[reviewer]", "rev-1")
MODULE = {"moduleId": "py-loops", "lessons": [{"lessonId": "l1", "activities": [
    {"activityId": "a-pre", "type": "assessment", "role": "pre"},
    {"activityId": "a-vid", "type": "video"},
    {"activityId": "a-post", "type": "assessment", "role": "post"}]}]}


def call(api, route, body=None, who=INS, path=None):
    auth = {"jwt": {"claims": {"sub": who[1], "cognito:groups": who[0]}}}
    resp = api.lambda_handler(api_event(route, body, auth=auth, path=path), None)
    return resp["statusCode"], json.loads(resp["body"])


@pytest.fixture
def setup(api, table):
    ddb = boto3.resource("dynamodb")
    ddb.create_table(TableName="events", BillingMode="PAY_PER_REQUEST",
                     KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
                     AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}, {"AttributeName": "sk", "AttributeType": "S"}])
    os.environ["EVENTS_TABLE"] = "events"
    ddb.Table("content").put_item(Item={"pk": "MOD#py-loops", "sk": "V#0002", "module": MODULE})
    cid = call(api, "POST /v1/classes", {"name": "P3", "orgId": "org_1"})[1]["data"]["classId"]
    call(api, "POST /v1/classes/{classId}/assignments", {"moduleId": "py-loops"}, path={"classId": cid})
    add = lambda name, **x: call(api, "POST /v1/classes/{classId}/roster", {"displayName": name, **x},
                                 path={"classId": cid})[1]["data"]
    keep, dup = add("Alex Kim"), add("Alex Kim", externalId="1042")
    return cid, keep, dup


def prog():
    return boto3.resource("dynamodb").Table("progress")


def items(student_id):
    return {i["sk"]: i for i in prog().query(KeyConditionExpression=Key("pk").eq(f"STU#{student_id}"))["Items"]}


def act(sid, cid, activity, **fields):
    prog().put_item(Item={"pk": f"STU#{sid}", "sk": f"ACT#py-loops#{activity}", "classId": cid, **fields})


def mod(sid, cid, **fields):
    prog().put_item(Item={"pk": f"STU#{sid}", "sk": "MOD#py-loops", "classId": cid, "state": "in_progress",
                          "gsi1pk": f"CLS#{cid}#MOD#py-loops", "gsi1sk": f"STU#{sid}", "moduleVersion": 2, **fields})


def asm(sid, cid, role, score, at):
    prog().put_item(Item={"pk": f"STU#{sid}", "sk": f"ASM#py-loops#{role}", "classId": cid, "moduleId": "py-loops",
                          "role": role, "scorePct": Decimal(score), "submittedAt": at,
                          "gsi1pk": f"CLS#{cid}#ASM#py-loops", "gsi1sk": f"{role}#{sid}"})


def merge(api, cid, dup, keep, who=INS):
    return call(api, "POST /v1/classes/{classId}/roster/{studentId}/merge", {"intoStudentId": keep}, who=who,
                path={"classId": cid, "studentId": dup})


def test_merge_combines_progress_and_removes_the_duplicate(api, setup, table):
    cid, keep, dup = setup
    k, d = keep["studentId"], dup["studentId"]
    act(k, cid, "a-pre", status="complete", attempts=1, activeSeconds=60, startedAt=200, completedAt=210)
    asm(k, cid, "pre", 40, 210)
    mod(k, cid, startedAt=200, lastActiveAt=210)
    act(d, cid, "a-vid", status="complete", attempts=1, activeSeconds=300, startedAt=300, completedAt=400)
    act(d, cid, "a-post", status="complete", attempts=1, startedAt=500, completedAt=510)
    act(d, cid, "a-pre", status="in_progress", attempts=2, activeSeconds=30, startedAt=100)
    asm(d, cid, "post", 80, 510)
    mod(d, cid, startedAt=100, lastActiveAt=510)
    prog().put_item(Item={"pk": f"STU#{d}", "sk": "SUB#a-ws#0000000000500", "activityId": "a-ws", "submittedAt": 500,
                          "gsi2pk": f"CLS#{cid}#REVIEW", "gsi2sk": f"0000000000500#{d}"})
    call(api, "POST /v1/classes/{classId}/students/{studentId}/unlock", {"moduleId": "py-loops"},
         path={"classId": cid, "studentId": d})

    status, body = merge(api, cid, d, k)
    assert status == 200, body
    assert body["data"]["merged"] == {"activities": 3, "modules": 1, "assessments": 1, "submissions": 1, "overrides": 1}

    got = items(k)
    pre = got["ACT#py-loops#a-pre"]
    assert pre["status"] == "complete" and pre["attempts"] == 3 and pre["activeSeconds"] == 90 and pre["startedAt"] == 100
    assert got["ACT#py-loops#a-vid"]["status"] == "complete"
    assert got["ASM#py-loops#post"]["gsi1sk"] == f"post#{k}" and got["ASM#py-loops#pre"]["scorePct"] == 40
    module = got["MOD#py-loops"]
    assert module["state"] == "complete" and module["gsi1sk"] == f"STU#{k}" and module["startedAt"] == 100
    assert got["SUB#a-ws#0000000000500"]["gsi2sk"] == f"0000000000500#{k}"
    assert items(d) == {}
    assert "Item" not in table.get_item(Key={"pk": f"CLS#{cid}", "sk": f"STU#{d}"})
    assert "Item" not in table.get_item(Key={"pk": f"STU#{d}", "sk": "META"})
    ovr = table.get_item(Key={"pk": f"CLS#{cid}", "sk": f"OVR#{k}#py-loops"})["Item"]
    assert ovr["studentId"] == k
    kept = table.get_item(Key={"pk": f"CLS#{cid}", "sk": f"STU#{k}"})["Item"]
    assert kept["externalId"] == "1042" and kept["credHmac"]  # filled from the duplicate; own login kept
    audit = boto3.resource("dynamodb").Table("events").scan()["Items"]
    assert [a["action"] for a in audit] == ["roster_merge"]


def test_the_earlier_assessment_is_kept_so_gain_is_not_inflated(api, setup):
    cid, keep, dup = setup
    k, d = keep["studentId"], dup["studentId"]
    asm(k, cid, "post", 60, 900)   # kept student took it later
    asm(d, cid, "post", 95, 500)   # duplicate took it first
    asm(k, cid, "pre", 30, 100)
    asm(d, cid, "pre", 10, 300)
    merge(api, cid, d, k)
    got = items(k)
    assert got["ASM#py-loops#post"]["scorePct"] == 95 and got["ASM#py-loops#post"]["submittedAt"] == 500
    assert got["ASM#py-loops#pre"]["scorePct"] == 30


def test_module_stays_in_progress_when_combined_work_is_still_incomplete(api, setup):
    cid, keep, dup = setup
    k, d = keep["studentId"], dup["studentId"]
    act(k, cid, "a-pre", status="complete", completedAt=10)
    mod(k, cid, startedAt=5)
    act(d, cid, "a-vid", status="in_progress", bestScore=Decimal(50))
    act(k, cid, "a-vid", status="in_progress", bestScore=Decimal(70), draft={"f1": "mine"})
    merge(api, cid, d, k)
    got = items(k)
    assert got["MOD#py-loops"]["state"] == "in_progress" and "completedAt" not in got["MOD#py-loops"]
    assert got["ACT#py-loops#a-vid"]["bestScore"] == 70 and got["ACT#py-loops#a-vid"]["draft"] == {"f1": "mine"}


def test_merging_a_student_with_no_progress_just_removes_them(api, setup):
    cid, keep, dup = setup
    status, body = merge(api, cid, dup["studentId"], keep["studentId"])
    assert status == 200 and set(body["data"]["merged"].values()) == {0}
    roster = call(api, "GET /v1/classes/{classId}/roster", path={"classId": cid})[1]["data"]
    assert [s["studentId"] for s in roster] == [keep["studentId"]]


def test_a_merge_can_be_rerun_after_partial_failure(api, setup, monkeypatch):
    import roster_merge
    cid, keep, dup = setup
    k, d = keep["studentId"], dup["studentId"]
    act(d, cid, "a-pre", status="complete", attempts=1)
    act(d, cid, "a-vid", status="complete", attempts=1)
    real, calls = roster_merge._move, []

    def flaky(table, old, new):
        calls.append(old["sk"])
        if len(calls) == 2:
            raise RuntimeError("network")
        return real(table, old, new)
    monkeypatch.setattr(roster_merge, "_move", flaky)
    assert merge(api, cid, d, k)[0] == 500
    monkeypatch.setattr(roster_merge, "_move", real)
    assert merge(api, cid, d, k)[0] == 200
    got = items(k)
    assert got["ACT#py-loops#a-pre"]["attempts"] == 1 and got["ACT#py-loops#a-vid"]["attempts"] == 1  # nothing counted twice


def test_validation_and_access(api, setup):
    cid, keep, dup = setup
    k, d = keep["studentId"], dup["studentId"]
    assert merge(api, cid, d, d)[0] == 400
    assert merge(api, cid, d, "ghost")[0] == 400
    assert merge(api, cid, "ghost", k)[0] == 404
    assert call(api, "POST /v1/classes/{classId}/roster/{studentId}/merge", {}, path={"classId": cid, "studentId": d})[0] == 400
    assert call(api, "POST /v1/classes/{classId}/roster/{studentId}/merge", {"intoStudentId": k, "x": 1},
                path={"classId": cid, "studentId": d})[0] == 400
    for who in (INS2, REV):
        assert merge(api, cid, d, k, who=who)[0] == 403
    other = call(api, "POST /v1/classes", {"name": "P4", "orgId": "org_1"})[1]["data"]["classId"]
    stranger = call(api, "POST /v1/classes/{classId}/roster", {"displayName": "X"}, path={"classId": other})[1]["data"]["studentId"]
    assert merge(api, cid, d, stranger)[0] == 400   # cannot merge across classes
    assert merge(api, cid, d, k, who=ADMIN)[0] == 200
