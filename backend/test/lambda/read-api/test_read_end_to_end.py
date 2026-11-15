"""The dashboard path end to end: an admin creates a cohort and a key, students finish a module
through the real class API, login and player, and the key reads aggregated results."""
import json

from integration import Setup, run
from support import load_lambda


def read(read_api, authorizer, key, route, path=None, query=None):
    decision = authorizer.lambda_handler({"headers": {"x-api-key": key}}, None)
    if not decision["isAuthorized"]:
        return 401, None
    return run(read_api, route, auth={"lambda": decision["context"]}, path=path, query=query)


def test_dashboard_reads_a_cohort_built_through_the_real_apis(tables):
    s = Setup(tables)
    admin_api, read_api, authorizer = load_lambda("admin-api"), load_lambda("read-api"), load_lambda("authorizer-apikey")
    cohort_id = run(admin_api, "POST /v1/admin/cohorts", {"name": "Maryvale"}, s.admin)[1]["data"]["cohortId"]
    assert run(admin_api, "PATCH /v1/admin/cohorts/{cohortId}", {"classIds": [s.class_id]}, s.admin, {"cohortId": cohort_id})[0] == 200
    key = run(admin_api, "POST /v1/admin/api-keys", {"label": "dash", "scopes": ["read:cohorts"]}, s.admin)[1]["data"]["key"]

    for i in range(5):
        _, words = s.add_student(f"Student {i}")
        s.finish_module(s.sign_in(words)[1], pre="b", post="a" if i < 4 else "b")
    path = {"cohortId": cohort_id}

    status, body = read(read_api, authorizer, key, "GET /v1/read/cohorts/{cohortId}/summary", path)
    d = body["data"]
    assert status == 200 and d["cohort"]["name"] == "Maryvale" and d["enrolled"] == 5
    assert d["completion"]["completionPct"] == 100.0
    assert (d["learningGain"]["n"], d["learningGain"]["meanPre"], d["learningGain"]["meanPost"]) == (5, 0.0, 80.0)
    assert d["learningGain"]["suppressed"] is False

    status, body = read(read_api, authorizer, key, "GET /v1/read/concepts/gain", query={"cohortId": cohort_id})
    assert body["data"]["concepts"][0]["concept"] == "loops" and body["data"]["concepts"][0]["masteryPct"] == 80
    assert [c["name"] for c in read(read_api, authorizer, key, "GET /v1/read/cohorts")[1]["data"]["cohorts"]] == ["Maryvale"]

    text = json.dumps(body) + json.dumps(read(read_api, authorizer, key, "GET /v1/read/cohorts/{cohortId}/summary", path)[1])
    assert "Student " not in text  # no names anywhere in the dashboard data

    # a revoked key is refused
    key_id = key.split("_")[1]
    assert run(admin_api, "DELETE /v1/admin/api-keys/{keyId}", auth=s.admin, path={"keyId": key_id})[0] == 200
    assert read(read_api, authorizer, key, "GET /v1/read/cohorts")[0] == 401
