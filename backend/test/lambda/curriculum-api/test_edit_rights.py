"""Only curriculum authors write. An author (an admin, or an instructor with the canAuthor flag) can see
and update every module CIC has made, not only their own. Other instructors and
reviewers can browse and assign published modules but never change them."""
import json
import pytest
from support import api_event
ADMIN = ("[cic_admin]", "adm-1")
OWNER = ("[instructor]", "ins-owner")     # an author who made the module
EDITOR = ("[instructor]", "ins-author")   # another author
OTHER = ("[instructor]", "ins-other")     # an instructor who is not an author
REV = ("[reviewer]", "rev-1")
@pytest.fixture(autouse=True)
def authors(table):
    for sub in ("ins-owner", "ins-author"):
        table.put_item(Item={"pk": f"USR#{sub}", "sk": "META", "canAuthor": True})
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
def test_an_author_can_open_and_save_their_own_draft(api, owned):
    mid, doc = owned
    assert call(api, "GET /v1/curriculum/modules/{moduleId}", who=OWNER, path={"moduleId": mid}, query={"draft": "true"})[0] == 200
    assert save(api, OWNER, mid, {**doc, "title": "Owner Loops 2"})[0] == 200
def test_any_author_can_open_edit_publish_and_see_versions_of_any_module(api, owned):
    mid, doc = owned
    path = {"moduleId": mid}
    assert call(api, "GET /v1/curriculum/modules/{moduleId}", who=EDITOR, path=path, query={"draft": "true"})[0] == 200
    assert save(api, EDITOR, mid, doc)[0] == 200
    assert save(api, ADMIN, mid, doc, rev="2")[0] == 200
    assert call(api, "GET /v1/curriculum/modules/{moduleId}/versions", who=EDITOR, path=path)[0] == 200
def test_everyone_else_cannot_open_drafts_save_publish_or_see_versions(api, owned):
    mid, doc = owned
    path = {"moduleId": mid}
    for who in (OTHER, REV):
        assert call(api, "GET /v1/curriculum/modules/{moduleId}", who=who, path=path, query={"draft": "true"})[0] == 403
        status, body = save(api, who, mid, doc)
        assert status == 403 and "curriculum authors" in body["error"]
        assert call(api, "POST /v1/curriculum/modules/{moduleId}/publish", who=who, path=path)[0] == 403
        assert call(api, "GET /v1/curriculum/modules/{moduleId}/versions", who=who, path=path)[0] == 403
def test_authors_see_every_draft_and_can_edit_all_of_them(api, owned):
    mid, _ = owned
    rows = lambda who: {m["moduleId"]: m for m in call(api, "GET /v1/curriculum/modules", who=who, query={"status": "all"})[1]["data"]}
    for who in (OWNER, EDITOR, ADMIN):
        assert rows(who)[mid]["canEdit"] is True
def test_non_authors_only_see_published_modules_whatever_they_ask_for(api, owned):
    mid, _ = owned
    for who in (OTHER, REV):
        status, body = call(api, "GET /v1/curriculum/modules", who=who, query={"status": "all"})
        assert status == 200 and mid not in [m["moduleId"] for m in body["data"]]
        assert all("canEdit" not in m for m in body["data"])
def test_only_the_creator_or_an_admin_can_delete(api, owned):
    mid, _ = owned
    path = {"moduleId": mid}
    for who in (EDITOR, OTHER):  # even another author cannot delete someone else's module
        assert call(api, "DELETE /v1/curriculum/modules/{moduleId}", who=who, path=path)[0] == 403
    assert call(api, "DELETE /v1/curriculum/modules/{moduleId}", who=OWNER, path=path)[0] == 200
