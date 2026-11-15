"""Every instructor can create and edit their own modules. Editing someone else's needs
admin or the canAuthor ("can edit all curriculum") flag. Reviewers never write."""
import json

import pytest
from support import api_event

ADMIN = ("[cic_admin]", "adm-1")
EDITOR = ("[instructor]", "ins-author")   # has canAuthor: can edit anyone's module
OWNER = ("[instructor]", "ins-owner")
OTHER = ("[instructor]", "ins-other")
REV = ("[reviewer]", "rev-1")


@pytest.fixture(autouse=True)
def editor(table):
    table.put_item(Item={"pk": "USR#ins-author", "sk": "META", "canAuthor": True})


def call(api, route, body=None, who=ADMIN, path=None, query=None, headers=None):
    auth = {"jwt": {"claims": {"sub": who[1], "cognito:groups": who[0]}}}
    resp = api.lambda_handler(api_event(route, body, auth=auth, path=path, query=query, headers=headers), None)
    return resp["statusCode"], json.loads(resp["body"])


@pytest.fixture
def owned(api):
    """A module created by OWNER, and its draft document."""
    doc = call(api, "POST /v1/curriculum/modules", {"title": "Owner Loops"}, who=OWNER)[1]["data"]
    return doc["moduleId"], {k: v for k, v in doc.items() if k not in ("revision", "draft")}


def save(api, who, mid, doc, rev="1"):
    return call(api, "PUT /v1/curriculum/modules/{moduleId}/draft", doc, who=who, path={"moduleId": mid}, headers={"If-Match": rev})


def test_the_creator_can_open_and_save_their_draft(api, owned):
    mid, doc = owned
    assert call(api, "GET /v1/curriculum/modules/{moduleId}", who=OWNER, path={"moduleId": mid}, query={"draft": "true"})[0] == 200
    assert save(api, OWNER, mid, {**doc, "title": "Owner Loops 2"})[0] == 200


def test_another_instructor_cannot_open_save_publish_or_see_versions(api, owned):
    mid, doc = owned
    path = {"moduleId": mid}
    assert call(api, "GET /v1/curriculum/modules/{moduleId}", who=OTHER, path=path, query={"draft": "true"})[0] == 403
    status, body = save(api, OTHER, mid, doc)
    assert status == 403 and "modules you created" in body["error"]
    assert call(api, "POST /v1/curriculum/modules/{moduleId}/publish", who=OTHER, path=path)[0] == 403
    assert call(api, "GET /v1/curriculum/modules/{moduleId}/versions", who=OTHER, path=path)[0] == 403


def test_admins_and_flagged_editors_can_edit_anyones_module(api, owned):
    mid, doc = owned
    assert save(api, EDITOR, mid, doc)[0] == 200
    assert save(api, ADMIN, mid, doc, rev="2")[0] == 200


def test_reviewers_cannot_save(api, owned):
    mid, doc = owned
    assert save(api, REV, mid, doc)[0] == 403


def test_list_says_who_can_edit_each_module(api, owned):
    mid, _ = owned
    rows = lambda who: {m["moduleId"]: m for m in call(api, "GET /v1/curriculum/modules", who=who, query={"status": "all"})[1]["data"]}
    assert rows(OWNER)[mid]["canEdit"] is True
    assert mid not in rows(OTHER)          # someone else's unpublished draft is not listed
    assert rows(EDITOR)[mid]["canEdit"] is True and rows(ADMIN)[mid]["canEdit"] is True


def test_others_only_delete_what_they_created(api, owned):
    mid, _ = owned
    assert call(api, "DELETE /v1/curriculum/modules/{moduleId}", who=OTHER, path={"moduleId": mid})[0] == 403
    assert call(api, "DELETE /v1/curriculum/modules/{moduleId}", who=OWNER, path={"moduleId": mid})[0] == 200
