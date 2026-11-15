import json

import pytest
from support import admin_auth, api_event, load_lambda


@pytest.fixture
def admin():
    return load_lambda("admin-api")


def call(admin, route, body=None, auth=None, path=None, query=None):
    event = api_event(route, body, auth=admin_auth() if auth is None else auth, path=path, query=query)
    resp = admin.lambda_handler(event, None)
    return resp["statusCode"], json.loads(resp["body"]), resp


def make_org(admin, name="Maryvale HS"):
    return call(admin, "POST /v1/admin/orgs", {"name": name})[1]["data"]


def make_cohort(admin, name="Maryvale", **extra):
    return call(admin, "POST /v1/admin/cohorts", {"name": name, **extra})


ALL_ROUTES = [
    ("GET /v1/admin/orgs", None, None),
    ("POST /v1/admin/orgs", {"name": "x"}, None),
    ("PATCH /v1/admin/orgs/{orgId}", {"name": "x"}, {"orgId": "org_aaaaaaaaaaaa"}),
    ("GET /v1/admin/cohorts", None, None),
    ("POST /v1/admin/cohorts", {"name": "x"}, None),
    ("PATCH /v1/admin/cohorts/{cohortId}", {"name": "x"}, {"cohortId": "coh_aaaaaaaaaaaa"}),
]


@pytest.mark.parametrize("route,body,path", ALL_ROUTES)
@pytest.mark.parametrize("groups", ["[instructor]", "[reviewer]", ""])
def test_non_admins_are_forbidden(admin, table, route, body, path, groups):
    status, data, _ = call(admin, route, body, auth=admin_auth(groups), path=path)
    assert status == 403 and data["code"] == "FORBIDDEN"


@pytest.mark.parametrize("route,body,path", ALL_ROUTES)
def test_missing_identity_is_unauthenticated(admin, table, route, body, path):
    assert call(admin, route, body, auth={}, path=path)[0] == 401


def test_create_and_list_orgs(admin, table):
    org = make_org(admin)
    assert org["orgId"].startswith("org_") and org["status"] == "active"
    status, data, _ = call(admin, "GET /v1/admin/orgs")
    assert status == 200 and [o["name"] for o in data["data"]] == ["Maryvale HS"]
    assert data["meta"] == {"nextCursor": None}


def test_rename_and_archive_org(admin, table):
    org = make_org(admin)
    status, data, _ = call(admin, "PATCH /v1/admin/orgs/{orgId}",
                           {"name": "Maryvale High", "status": "archived"}, path={"orgId": org["orgId"]})
    assert status == 200 and data["data"]["name"] == "Maryvale High" and data["data"]["status"] == "archived"


def test_patch_unknown_org_is_404_and_does_not_create_it(admin, table):
    status, _, _ = call(admin, "PATCH /v1/admin/orgs/{orgId}", {"name": "x"}, path={"orgId": "org_aaaaaaaaaaaa"})
    assert status == 404
    assert call(admin, "GET /v1/admin/orgs")[1]["data"] == []


@pytest.mark.parametrize("body", [{}, {"name": ""}, {"name": "x" * 101}, {"name": 5}, {"name": "ok", "role": "admin"}])
def test_org_validation(admin, table, body):
    assert call(admin, "POST /v1/admin/orgs", body)[0] == 400


def test_org_patch_rejects_unknown_status_and_empty_body(admin, table):
    org = make_org(admin)
    for body in ({"status": "deleted"}, {}):
        assert call(admin, "PATCH /v1/admin/orgs/{orgId}", body, path={"orgId": org["orgId"]})[0] == 400


def test_pagination_follows_cursor(admin, table):
    for n in range(3):
        make_org(admin, f"School {n}")
    status, first, _ = call(admin, "GET /v1/admin/orgs", query={"limit": "2"})
    assert len(first["data"]) == 2 and first["meta"]["nextCursor"]
    _, second, _ = call(admin, "GET /v1/admin/orgs", query={"limit": "2", "cursor": first["meta"]["nextCursor"]})
    assert len(second["data"]) == 1 and second["meta"]["nextCursor"] is None


@pytest.mark.parametrize("query", [{"limit": "0"}, {"limit": "201"}, {"limit": "x"}, {"cursor": "garbage"}])
def test_bad_paging_params_are_400(admin, table, query):
    assert call(admin, "GET /v1/admin/orgs", query=query)[0] == 400


def test_cohort_with_org(admin, table):
    org = make_org(admin)
    status, data, _ = make_cohort(admin, orgId=org["orgId"])
    assert status == 201 and data["data"]["orgId"] == org["orgId"]
    assert [c["name"] for c in call(admin, "GET /v1/admin/cohorts")[1]["data"]] == ["Maryvale"]


def test_cohort_with_unknown_org_is_400(admin, table):
    assert make_cohort(admin, orgId="org_missing")[0] == 400


def test_orgs_and_cohorts_are_listed_separately(admin, table):
    make_org(admin)
    make_cohort(admin)
    assert len(call(admin, "GET /v1/admin/orgs")[1]["data"]) == 1
    assert len(call(admin, "GET /v1/admin/cohorts")[1]["data"]) == 1


def add_class(table, class_id):
    table.put_item(Item={"pk": f"CLS#{class_id}", "sk": "META", "status": "active"})


def test_cohort_membership_add_move_and_remove(admin, table):
    add_class(table, "cls_01")
    add_class(table, "cls_02")
    a = make_cohort(admin, "A")[1]["data"]["cohortId"]
    b = make_cohort(admin, "B")[1]["data"]["cohortId"]
    patch = lambda cid, ids: call(admin, "PATCH /v1/admin/cohorts/{cohortId}", {"classIds": ids}, path={"cohortId": cid})

    assert patch(a, ["cls_01", "cls_02"])[1]["data"]["classIds"] == ["cls_01", "cls_02"]
    assert patch(b, ["cls_02"])[1]["data"]["classIds"] == ["cls_02"]  # cls_02 moves to B
    assert patch(a, [])[1]["data"]["classIds"] == []  # explicit empty list clears A
    cls = table.get_item(Key={"pk": "CLS#cls_02", "sk": "META"})["Item"]
    assert cls["cohortId"] == b and cls["gsi2pk"] == f"COH#{b}"
    assert "cohortId" not in table.get_item(Key={"pk": "CLS#cls_01", "sk": "META"})["Item"]


def test_cohort_with_unknown_class_is_400_and_changes_nothing(admin, table):
    add_class(table, "cls_01")
    cid = make_cohort(admin)[1]["data"]["cohortId"]
    status, _, _ = call(admin, "PATCH /v1/admin/cohorts/{cohortId}",
                        {"classIds": ["cls_01", "nope"]}, path={"cohortId": cid})
    assert status == 400
    assert "cohortId" not in table.get_item(Key={"pk": "CLS#cls_01", "sk": "META"})["Item"]


def test_cohort_rename_and_unknown_cohort(admin, table):
    cid = make_cohort(admin)[1]["data"]["cohortId"]
    _, data, _ = call(admin, "PATCH /v1/admin/cohorts/{cohortId}", {"name": "Maryvale 2026"}, path={"cohortId": cid})
    assert data["data"]["name"] == "Maryvale 2026" and data["data"]["classIds"] == []
    assert call(admin, "PATCH /v1/admin/cohorts/{cohortId}", {"name": "x"}, path={"cohortId": "coh_aaaaaaaaaaaa"})[0] == 404
    assert call(admin, "PATCH /v1/admin/cohorts/{cohortId}", {"name": "x"}, path={"cohortId": "../x"})[0] == 404
