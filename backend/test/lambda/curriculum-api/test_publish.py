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
PUBLISH = "POST /v1/curriculum/modules/{moduleId}/publish"


@pytest.fixture(autouse=True)
def grant_author(table):
    table.put_item(Item={"pk": "USR#ins-author", "sk": "META", "canAuthor": True})


def call(api, route, body=None, who=ADMIN, path=None, query=None, headers=None):
    auth = {"jwt": {"claims": {"sub": who[1], "cognito:groups": who[0]}}}
    resp = api.lambda_handler(api_event(route, body, auth=auth, path=path, query=query, headers=headers), None)
    return resp["statusCode"], json.loads(resp["body"])


def activity(doc, activity_id):
    return next(a for l in doc["lessons"] for a in l["activities"] if a["activityId"] == activity_id)


def fill(doc):
    """Complete every blank in the template so the module is publishable."""
    def mcq(q, concept=None):
        q.update(prompt="Which one?", answerKey="a")
        q["choices"][0]["text"], q["choices"][1]["text"] = "A", "B"
        if concept:
            q["concept"] = concept
    mcq(activity(doc, "a-pre")["questions"][0], "loops")
    mcq(activity(doc, "a-chk")["questions"][0])
    mcq(activity(doc, "a-exit")["questions"][0])
    mcq(activity(doc, "a-post")["questions"][0], "loops")
    activity(doc, "a-vid")["videoId"] = "dQw4w9WgXcQ"
    activity(doc, "a-ws")["fields"][0]["prompt"] = "Describe a loop"
    return doc


def save(api, doc, revision):
    return call(api, "PUT /v1/curriculum/modules/{moduleId}/draft", doc, path=PATH, headers={"If-Match": str(revision)})


@pytest.fixture
def ready(api):
    created = call(api, "POST /v1/curriculum/modules", {"title": "Python Loops"})[1]["data"]
    doc = fill({k: v for k, v in created.items() if k not in ("revision", "draft")})
    assert save(api, doc, 1)[0] == 200
    return doc


def problems(api, doc, revision):
    assert save(api, doc, revision)[0] == 200
    status, body = call(api, PUBLISH, path=PATH)
    assert status == 400 and body["code"] == "VALIDATION_ERROR"
    return {p["path"]: p["message"] for p in body["details"]}


def test_the_blank_template_is_not_publishable_and_lists_every_blank(api):
    call(api, "POST /v1/curriculum/modules", {"title": "Python Loops"})
    status, body = call(api, PUBLISH, path=PATH)
    paths = {p["path"] for p in body["details"]}
    assert status == 400
    assert "$.lessons[0].activities[1].videoId" in paths
    assert "$.lessons[0].activities[0].questions[0].prompt" in paths
    assert "$.lessons[0].activities[0].questions[0].concept" in paths
    assert "$.lessons[0].activities[2].questions[0].answerKey" in paths


def test_publish_creates_an_immutable_version_and_updates_the_module(api, ready):
    status, body = call(api, PUBLISH, path=PATH)
    assert status == 201 and body["data"]["version"] == 1
    table = boto3.resource("dynamodb").Table("content")
    meta = table.get_item(Key={"pk": "MOD#python-loops", "sk": "META"})["Item"]
    assert meta["latestVersion"] == 1 and meta["publishedRevision"] == meta["revision"]
    snapshot = table.get_item(Key={"pk": "MOD#python-loops", "sk": "V#0001"})["Item"]
    assert snapshot["module"]["moduleId"] == "python-loops" and snapshot["publishedBy"] == "adm-1"
    read = call(api, "GET /v1/curriculum/modules/{moduleId}", who=REV, path=PATH)[1]["data"]
    assert read["version"] == 1 and activity(read, "a-chk")["questions"][0]["answerKey"] == "a"


def test_publishing_twice_without_changes_is_refused(api, ready):
    call(api, PUBLISH, path=PATH)
    status, body = call(api, PUBLISH, path=PATH)
    assert status == 409 and body["code"] == "ALREADY_PUBLISHED"


def test_editing_the_draft_does_not_change_the_published_version(api, ready):
    call(api, PUBLISH, path=PATH)
    edited = copy.deepcopy(ready)
    edited["title"] = "Changed"
    activity(edited, "a-chk")["questions"][0]["answerKey"] = "b"
    assert save(api, edited, 2)[0] == 200
    v1 = call(api, "GET /v1/curriculum/modules/{moduleId}", path=PATH)[1]["data"]
    assert v1["title"] == "Python Loops" and activity(v1, "a-chk")["questions"][0]["answerKey"] == "a"
    assert call(api, "GET /v1/curriculum/modules", query={"status": "all"})[1]["data"][0]["hasUnpublishedChanges"] is True
    assert call(api, PUBLISH, path=PATH)[1]["data"]["version"] == 2
    assert call(api, "GET /v1/curriculum/modules/{moduleId}/versions/{version}", who=INS,
                path={**PATH, "version": "1"})[1]["data"]["title"] == "Python Loops"


@pytest.mark.parametrize("change,path", [
    (lambda d: activity(d, "a-pre")["questions"][0].pop("concept"), "questions[0].concept"),
    (lambda d: activity(d, "a-pre")["questions"][0].pop("answerKey"), "questions[0].answerKey"),
    (lambda d: activity(d, "a-pre")["questions"][0].update(points=0), "points"),
    (lambda d: activity(d, "a-post")["questions"][0].update(concept="other"), "$"),          # pre/post concepts differ
    (lambda d: activity(d, "a-chk")["questions"][0].update(prompt="  "), "prompt"),
    (lambda d: activity(d, "a-chk")["questions"][0]["choices"][1].update(text=""), "choices[1].text"),
    (lambda d: activity(d, "a-vid").update(videoId=""), "videoId"),
    (lambda d: activity(d, "a-ws").update(fields=[]), "fields"),
    (lambda d: d.update(title=""), "$.title"),
    (lambda d: d["lessons"][0]["activities"].reverse(), "activities[0]"),                  # pretest not first
    (lambda d: d["lessons"][0]["activities"].pop(0), "activities[0]"),                     # no pretest at all
    (lambda d: d["lessons"][0]["activities"].pop(), "activities["),                        # no post-test
])
def test_publish_validation(api, ready, change, path):
    doc = copy.deepcopy(ready)
    change(doc)
    assert any(path in p for p in problems(api, doc, 2)), path


def test_exit_questions_need_no_answer_key_and_worksheet_fields_can_be_free_text(api, ready):
    doc = copy.deepcopy(ready)
    activity(doc, "a-exit")["questions"][0].pop("answerKey")
    assert save(api, doc, 2)[0] == 200
    assert call(api, PUBLISH, path=PATH)[0] == 201


def test_two_concepts_covered_on_both_sides_is_fine(api, ready):
    doc = copy.deepcopy(ready)
    for aid in ("a-pre", "a-post"):
        extra = copy.deepcopy(activity(doc, aid)["questions"][0])
        extra.update(questionId=f"{aid}-2", concept="lists")
        extra.pop("pairKey")
        activity(doc, aid)["questions"].append(extra)
    assert save(api, doc, 2)[0] == 200
    assert call(api, PUBLISH, path=PATH)[0] == 201


def test_only_authors_publish_and_missing_modules_are_404(api, ready):
    for who in (INS, REV):
        assert call(api, PUBLISH, who=who, path=PATH)[0] == 403
    assert call(api, PUBLISH, who=AUTHOR, path=PATH)[0] == 201
    assert call(api, PUBLISH, path={"moduleId": "nope"})[0] == 404


def test_versions_list_is_for_authors_newest_first(api, ready):
    call(api, PUBLISH, path=PATH)
    doc = copy.deepcopy(ready); doc["title"] = "v2"
    save(api, doc, 2)
    call(api, PUBLISH, path=PATH)
    status, body = call(api, "GET /v1/curriculum/modules/{moduleId}/versions", path=PATH)
    assert status == 200 and [v["version"] for v in body["data"]] == [2, 1]
    assert "module" not in body["data"][0]
    for who in (INS, REV):
        assert call(api, "GET /v1/curriculum/modules/{moduleId}/versions", who=who, path=PATH)[0] == 403
    assert call(api, "GET /v1/curriculum/modules/{moduleId}/versions", path={"moduleId": "nope"})[0] == 404


@pytest.mark.parametrize("version", ["0", "3", "abc", "-1", "10000"])
def test_unknown_versions_are_404(api, ready, version):
    call(api, PUBLISH, path=PATH)
    assert call(api, "GET /v1/curriculum/modules/{moduleId}/versions/{version}", path={**PATH, "version": version})[0] == 404


def test_concepts_list_counts_modules_and_hides_unpublished_ones_from_non_authors(api, ready):
    other = call(api, "POST /v1/curriculum/modules", {"title": "Other"})[1]["data"]
    other = {k: v for k, v in other.items() if k not in ("revision", "draft")}
    activity(other, "a-pre")["questions"][0]["concept"] = "lists"
    call(api, "PUT /v1/curriculum/modules/{moduleId}/draft", other, path={"moduleId": "other"}, headers={"If-Match": "1"})
    call(api, PUBLISH, path=PATH)
    names = lambda who: {c["concept"]: c["moduleCount"] for c in call(api, "GET /v1/curriculum/concepts", who=who)[1]["data"]}
    assert names(ADMIN) == {"loops": 1, "lists": 1}      # authors see drafts too
    assert names(INS) == {"loops": 1} and names(REV) == {"loops": 1}
