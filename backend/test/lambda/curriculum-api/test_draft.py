import copy
import json

import boto3
import pytest
from support import api_event

ADMIN = ("[cic_admin]", "adm-1")
AUTHOR = ("[instructor]", "ins-author")
INS = ("[instructor]", "ins-plain")
REV = ("[reviewer]", "rev-1")
PATH = {"moduleId": "python-loops"}


@pytest.fixture(autouse=True)
def grant_author(table):
    table.put_item(Item={"pk": "USR#ins-author", "sk": "META", "canAuthor": True})


def call(api, route, body=None, who=ADMIN, path=None, query=None, headers=None):
    auth = {"jwt": {"claims": {"sub": who[1], "cognito:groups": who[0]}}}
    event = api_event(route, body, auth=auth, path=path, query=query, headers=headers)
    resp = api.lambda_handler(event, None)
    return resp["statusCode"], json.loads(resp["body"])


@pytest.fixture
def draft(api):
    status, body = call(api, "POST /v1/curriculum/modules", {"title": "Python Loops"})
    assert status == 201
    doc = {k: v for k, v in body["data"].items() if k not in ("revision", "draft")}
    return doc


def put(api, doc, revision="1", who=ADMIN, path=PATH):
    headers = {"If-Match": revision} if revision is not None else {}
    return call(api, "PUT /v1/curriculum/modules/{moduleId}/draft", doc, who=who, path=path, headers=headers)


def activity(doc, activity_id):
    return next(a for l in doc["lessons"] for a in l["activities"] if a["activityId"] == activity_id)


def test_save_template_as_is_bumps_revision_and_updates_meta(api, draft):
    doc = call(api, "GET /v1/curriculum/modules/{moduleId}", path=PATH, query={"draft": "true"})[1]["data"]
    doc = {k: v for k, v in doc.items() if k not in ("revision", "draft")}
    doc["title"] = "Python Loops 2"
    activity(doc, "a-pre")["questions"][0]["concept"] = "loops"
    status, body = put(api, doc)
    assert status == 200 and body["data"]["revision"] == 2
    meta = boto3.resource("dynamodb").Table("content").get_item(Key={"pk": "MOD#python-loops", "sk": "META"})["Item"]
    assert meta["title"] == "Python Loops 2" and meta["concepts"] == ["loops"] and meta["revision"] == 2
    read = call(api, "GET /v1/curriculum/modules/{moduleId}", path=PATH, query={"draft": "true"})[1]["data"]
    assert read["revision"] == 2 and read["title"] == "Python Loops 2"


def test_stale_revision_is_a_conflict_and_changes_nothing(api, draft):
    first = copy.deepcopy(draft); first["title"] = "A"
    second = copy.deepcopy(draft); second["title"] = "B"
    assert put(api, first)[0] == 200
    status, body = put(api, second)  # still revision 1
    assert status == 409 and body["code"] == "REVISION_CONFLICT" and body["details"] == {"currentRevision": 2}
    assert call(api, "GET /v1/curriculum/modules/{moduleId}", path=PATH, query={"draft": "true"})[1]["data"]["title"] == "A"
    assert put(api, second, revision="2")[0] == 200


@pytest.mark.parametrize("header", [None, "", "abc", "-1", "1.5"])
def test_if_match_is_required_and_numeric(api, draft, header):
    assert put(api, draft, revision=header)[0] == 400


def test_if_match_accepts_quoted_and_weak_forms(api, draft):
    assert put(api, draft, revision='"1"')[0] == 200
    assert put(api, draft, revision='W/"2"')[0] == 200


def test_saving_a_missing_module_is_404(api, draft):
    assert put(api, draft, path={"moduleId": "nope"})[0] == 400  # the document's moduleId does not match
    doc = {**draft, "moduleId": "nope"}
    assert put(api, doc, path={"moduleId": "nope"})[0] == 404


def problems(api, doc):
    status, body = put(api, doc)
    assert status == 400 and body["code"] == "VALIDATION_ERROR"
    return {p["path"]: p["message"] for p in body["details"]}


def test_structure_problems_are_listed_with_paths(api, draft):
    doc = copy.deepcopy(draft)
    doc["moduleId"] = "other"
    doc["surprise"] = 1
    doc["lessons"][0]["activities"][0]["type"] = "poll"
    doc["lessons"][0]["activities"][2]["questions"][0]["activityId"] = "x"
    got = problems(api, doc)
    assert "$.moduleId" in got and "$.surprise" in got
    assert "$.lessons[0].activities[0].type" in got
    assert "$.lessons[0].activities[2].questions[0].activityId" in got


def test_ids_must_be_unique_across_the_module(api, draft):
    doc = copy.deepcopy(draft)
    doc["lessons"][0]["activities"][1]["activityId"] = "a-pre"
    doc["lessons"][0]["activities"][2]["questions"][0]["questionId"] = "q-pre-1"
    got = problems(api, doc)
    assert "$.lessons[0].activities[1].activityId" in got
    assert "$.lessons[0].activities[2].questions[0].questionId" in got


@pytest.mark.parametrize("change,path", [
    (lambda d: activity(d, "a-vid").update(videoId="short"), "videoId"),
    (lambda d: activity(d, "a-vid").update(provider="vimeo"), "provider"),
    (lambda d: activity(d, "a-vid").update(minSeconds=-1), "minSeconds"),
    (lambda d: activity(d, "a-pre").update(role="mid"), "role"),
    (lambda d: activity(d, "a-chk").update(passPct=101), "passPct"),
    (lambda d: activity(d, "a-chk")["questions"][0].update(answerKey="zzz"), "answerKey"),
    (lambda d: activity(d, "a-chk")["questions"][0].update(type="multi", answerKey="a"), "answerKey"),
    (lambda d: activity(d, "a-chk")["questions"][0].update(concept="Loops!"), "concept"),
    (lambda d: activity(d, "a-chk")["questions"][0].update(points=500), "points"),
    (lambda d: activity(d, "a-chk")["questions"][0].update(prompt="x" * 2001), "prompt"),
    (lambda d: activity(d, "a-chk")["questions"][0].update(type="short", answerKey=["ok"]), "choices"),
    (lambda d: activity(d, "a-chk")["questions"][0]["choices"].append({"id": "a", "text": "dup"}), "choices"),
    (lambda d: activity(d, "a-ws")["fields"][0].update(answerKey={"value": "x"}), "answerKey"),
    (lambda d: activity(d, "a-ws").update(unknown=1), "unknown"),
])
def test_bad_values_are_rejected(api, draft, change, path):
    doc = copy.deepcopy(draft)
    change(doc)
    assert any(path in p for p in problems(api, doc))


def test_valid_answer_keys_for_every_question_type_are_accepted(api, draft):
    doc = copy.deepcopy(draft)
    qs = activity(doc, "a-chk")["questions"]
    qs[0].update(answerKey="a", concept="loops", points=0.5, explanation="because")
    qs.append({"questionId": "q2", "type": "multi", "prompt": "p", "choices": [{"id": "x", "text": "X"}, {"id": "y", "text": "Y"}], "answerKey": ["x", "y"]})
    qs.append({"questionId": "q3", "type": "short", "prompt": "p", "answerKey": ["range", "Range()"]})
    qs.append({"questionId": "q4", "type": "numeric", "prompt": "p", "answerKey": {"value": 3.14, "tolerance": 0.01}})
    qs.append({"questionId": "q5", "type": "numeric", "prompt": "p", "answerKey": 42})
    activity(doc, "a-ws")["fields"].append({"fieldId": "f2", "type": "short", "prompt": "p", "answerKey": "yes"})
    assert put(api, doc)[0] == 200
    stored = call(api, "GET /v1/curriculum/modules/{moduleId}", path=PATH, query={"draft": "true"})[1]["data"]
    assert activity(stored, "a-chk")["questions"][3]["answerKey"] == {"value": 3.14, "tolerance": 0.01}


def test_size_and_shape_limits(api, draft):
    doc = copy.deepcopy(draft)
    activity(doc, "a-ws")["instructions"] = "x" * 4001
    assert problems(api, doc)
    big = copy.deepcopy(draft)
    big["lessons"][0]["activities"][1]["body"] = "x" * 4000
    for i in range(20):
        big["lessons"].append({"lessonId": f"l{i + 2}", "title": "t", "activities": [
            {"activityId": f"s{i}", "type": "slides", "slides": [{"body": "y" * 4000}] * 90}]})
    assert put(api, big)[0] == 400  # over the 256 KB request limit
    assert put(api, [1, 2])[0] == 400


def test_only_authors_can_save(api, draft):
    assert put(api, draft, who=AUTHOR)[0] == 200
    for who in (INS, REV):
        assert put(api, draft, revision="2", who=who)[0] == 403
