import json

import boto3
import pytest
from support import api_event

ADMIN = ("[cic_admin]", "adm-1")
AUTHOR = ("[instructor]", "ins-author")
INS = ("[instructor]", "ins-plain")
REV = ("[reviewer]", "rev-1")


@pytest.fixture(autouse=True)
def grant_author(table):
    table.put_item(Item={"pk": "USR#ins-author", "sk": "META", "canAuthor": True})


def call(api, route, body=None, who=ADMIN, path=None, query=None):
    auth = {"jwt": {"claims": {"sub": who[1], "cognito:groups": who[0]}}}
    resp = api.lambda_handler(api_event(route, body, auth=auth, path=path, query=query), None)
    return resp["statusCode"], json.loads(resp["body"])


def create(api, title="Python Loops", who=ADMIN, **extra):
    return call(api, "POST /v1/curriculum/modules", {"title": title, **extra}, who=who)


def publish_by_hand(module_id, version=1):
    """Stand-in for the publish route (added in a later PR)."""
    content = boto3.resource("dynamodb").Table("content")
    draft = content.get_item(Key={"pk": f"MOD#{module_id}", "sk": "DRAFT"})["Item"]
    content.put_item(Item={"pk": f"MOD#{module_id}", "sk": f"V#{version:04d}", "module": draft["module"]})
    content.update_item(Key={"pk": f"MOD#{module_id}", "sk": "META"}, UpdateExpression="SET latestVersion = :v, publishedRevision = :r",
                        ExpressionAttributeValues={":v": version, ":r": draft["revision"]})


def test_create_seeds_the_standard_template(api):
    status, body = create(api)
    doc = body["data"]
    assert status == 201 and doc["moduleId"] == "python-loops" and doc["revision"] == 1 and doc["draft"] is True
    acts = doc["lessons"][0]["activities"]
    assert [a["type"] for a in acts] == ["assessment", "video", "check", "worksheet", "exit", "assessment"]
    assert [a.get("role") for a in acts if a["type"] == "assessment"] == ["pre", "post"]


def test_repeated_title_gets_a_new_id(api):
    first = create(api)[1]["data"]["moduleId"]
    second = create(api)[1]["data"]["moduleId"]
    assert first == "python-loops" and second != first and second.startswith("python-loops-")


@pytest.mark.parametrize("body", [{}, {"title": ""}, {"title": "x" * 121}, {"title": "ok", "template": "blank"},
                                  {"title": "ok", "moduleId": "x"}])
def test_create_validation(api, body):
    assert call(api, "POST /v1/curriculum/modules", body)[0] == 400


def test_authors_can_create_and_others_cannot(api):
    assert create(api, who=AUTHOR)[0] == 201
    assert create(api, "Other", who=INS)[0] == 403
    assert create(api, "Other", who=REV)[0] == 403


def test_authoring_permission_comes_from_the_stored_flag_not_the_token(api, table):
    table.put_item(Item={"pk": "USR#ins-plain", "sk": "META", "canAuthor": False})
    assert create(api, who=INS)[0] == 403
    table.put_item(Item={"pk": "USR#ins-plain", "sk": "META", "canAuthor": True})
    assert create(api, who=INS)[0] == 201
    table.put_item(Item={"pk": "USR#rev-1", "sk": "META", "canAuthor": True})
    assert create(api, "Rev", who=REV)[0] == 403  # reviewers never write


def test_list_filters_and_who_sees_what(api):
    create(api, "Draft Only")
    create(api, "Live One")
    publish_by_hand("live-one")
    names = lambda who, **q: [m["title"] for m in call(api, "GET /v1/curriculum/modules", who=who, query=q or None)[1]["data"]]
    assert names(ADMIN) == ["Live One"]                                  # default: published
    assert names(ADMIN, status="draft") == ["Draft Only"]
    assert sorted(names(ADMIN, status="all")) == ["Draft Only", "Live One"]
    assert names(INS) == ["Live One"] and names(REV) == ["Live One"]
    for who in (INS, REV):
        assert call(api, "GET /v1/curriculum/modules", who=who, query={"status": "draft"})[0] == 403
    assert call(api, "GET /v1/curriculum/modules", query={"status": "nope"})[0] == 400


def test_list_flags_unpublished_changes_for_authors_only(api):
    create(api, "Live One")
    publish_by_hand("live-one")
    admin_row = call(api, "GET /v1/curriculum/modules")[1]["data"][0]
    assert admin_row["hasUnpublishedChanges"] is False and admin_row["status"] == "published"
    boto3.resource("dynamodb").Table("content").update_item(
        Key={"pk": "MOD#live-one", "sk": "META"}, UpdateExpression="SET revision = :r", ExpressionAttributeValues={":r": 2})
    assert call(api, "GET /v1/curriculum/modules")[1]["data"][0]["hasUnpublishedChanges"] is True
    assert "hasUnpublishedChanges" not in call(api, "GET /v1/curriculum/modules", who=INS)[1]["data"][0]


def test_list_paginates(api):
    for n in range(3):
        create(api, f"Module {n}")
    _, first = call(api, "GET /v1/curriculum/modules", query={"status": "all", "limit": "2"})
    assert len(first["data"]) == 2 and first["meta"]["nextCursor"]
    _, second = call(api, "GET /v1/curriculum/modules", query={"status": "all", "limit": "2", "cursor": first["meta"]["nextCursor"]})
    assert len(second["data"]) == 1 and second["meta"]["nextCursor"] is None


def test_get_returns_latest_published_with_answer_keys_to_all_staff(api):
    create(api, "Live One")
    publish_by_hand("live-one", 1)
    for who in (ADMIN, INS, REV):
        status, body = call(api, "GET /v1/curriculum/modules/{moduleId}", who=who, path={"moduleId": "live-one"})
        assert status == 200 and body["data"]["version"] == 1 and body["data"]["moduleId"] == "live-one"
        assert "lessons" in body["data"]


def test_unpublished_module_is_404_for_everyone_without_draft_flag(api):
    create(api, "Draft Only")
    for who in (ADMIN, INS, REV):
        assert call(api, "GET /v1/curriculum/modules/{moduleId}", who=who, path={"moduleId": "draft-only"})[0] == 404


def test_draft_is_for_authors(api):
    create(api, "Draft Only")
    path, q = {"moduleId": "draft-only"}, {"draft": "true"}
    status, body = call(api, "GET /v1/curriculum/modules/{moduleId}", path=path, query=q)
    assert status == 200 and body["data"]["revision"] == 1 and body["data"]["draft"] is True
    assert call(api, "GET /v1/curriculum/modules/{moduleId}", who=AUTHOR, path=path, query=q)[0] == 200
    for who in (INS, REV):
        assert call(api, "GET /v1/curriculum/modules/{moduleId}", who=who, path=path, query=q)[0] == 403
    assert call(api, "GET /v1/curriculum/modules/{moduleId}", path={"moduleId": "nope"}, query=q)[0] == 404


def test_bad_module_ids_are_404_and_unauthenticated_is_401(api):
    assert call(api, "GET /v1/curriculum/modules/{moduleId}", path={"moduleId": "a#b"})[0] == 404
    event = api_event("GET /v1/curriculum/modules", auth={"jwt": {"claims": {}}})
    assert api.lambda_handler(event, None)["statusCode"] == 401
