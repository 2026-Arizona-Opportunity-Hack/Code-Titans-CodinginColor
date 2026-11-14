import json
import time

import pytest
from conftest import load_lambda

NOW_MS = int(time.time() * 1000)
NAMES = ["Ana", "Ben", "Cy", "Di", "Eli"]


def seed_class(tables, class_id, cohort_id, count, pre=40, post=80, complete=True):
    core, progress = tables["CORE_TABLE"], tables["PROGRESS_TABLE"]
    core.put_item(Item={"pk": f"CLS#{class_id}", "sk": "META", "name": f"Class {class_id}", "cohortId": cohort_id, "orgId": "org1",
                        "gsi2pk": f"COH#{cohort_id}", "gsi2sk": f"CLS#{class_id}"})
    core.put_item(Item={"pk": f"CLS#{class_id}", "sk": "ASG#0001#m1", "moduleId": "m1", "moduleVersion": 1})
    for i in range(count):
        sid = f"{class_id}-s{i}"
        core.put_item(Item={"pk": f"CLS#{class_id}", "sk": f"STU#{sid}", "displayName": NAMES[i % 5], "rosterNumber": i + 1, "status": "active"})
        for role, score in (("pre", pre), ("post", post)):
            progress.put_item(Item={"pk": f"STU#{sid}", "sk": f"ASM#m1#{role}", "role": role, "scorePct": score, "submittedAt": NOW_MS,
                                    "byConcept": {"loops": {"correct": score // 25, "total": 4, "items": 4}},
                                    "gsi1pk": f"CLS#{class_id}#ASM#m1", "gsi1sk": f"{role}#{sid}"})
        progress.put_item(Item={"pk": f"STU#{sid}", "sk": "MOD#m1", "state": "complete" if complete else "in_progress", "startedAt": NOW_MS,
                                "completedAt": NOW_MS, "gsi1pk": f"CLS#{class_id}#MOD#m1", "gsi1sk": f"STU#{sid}"})


@pytest.fixture
def api(tables):
    tables["CONTENT_TABLE"].put_item(Item={"pk": "MOD#m1", "sk": "V#0001", "module": {"moduleId": "m1", "title": "Loops", "lessons": []}})
    core = tables["CORE_TABLE"]
    core.put_item(Item={"pk": "COH#coh1", "sk": "META", "name": "Maryvale"})
    core.put_item(Item={"pk": "COH#coh2", "sk": "META", "name": "Tiny Cohort"})
    core.put_item(Item={"pk": "ORG#org1", "sk": "META", "name": "Maryvale HS"})
    seed_class(tables, "cls1", "coh1", 5)
    seed_class(tables, "cls2", "coh1", 3, pre=50, post=70, complete=False)
    seed_class(tables, "cls3", "coh2", 2)
    mod = load_lambda("read-api")

    def call(route, path=None, query=None, scopes="read:cohorts", authorized=True):
        ctx = {"lambda": {"keyId": "k1", "scopes": scopes}} if authorized else {}
        event = {"routeKey": route, "pathParameters": path or {}, "queryStringParameters": query, "headers": {},
                 "requestContext": {"requestId": "r", "http": {"method": "GET"}, "authorizer": ctx}}
        resp = mod.lambda_handler(event, None)
        return resp["statusCode"], json.loads(resp["body"])

    return call


def test_requires_a_key_with_the_read_scope(api):
    assert api("GET /v1/read/cohorts", authorized=False)[0] == 401
    assert api("GET /v1/read/cohorts", scopes="other")[0] == 403


def test_cohort_summary_pools_classes(api):
    status, body = api("GET /v1/read/cohorts/{cohortId}/summary", {"cohortId": "coh1"})
    d = body["data"]
    assert status == 200 and d["cohort"]["name"] == "Maryvale" and d["enrolled"] == 8 and d["classes"] == 2
    assert d["learningGain"]["n"] == 8 and d["learningGain"]["suppressed"] is False
    assert d["learningGain"]["meanGain"] == 32.5  # (5 x 40 + 3 x 20) / 8
    assert d["completion"]["completionPct"] == 62.5  # 5 of 8 complete
    by_class = {c["name"]: c for c in d["byClass"]}
    assert by_class["Class cls2"]["suppressed"] is True and by_class["Class cls2"]["meanGain"] is None
    assert by_class["Class cls1"]["meanGain"] == 40.0


def test_small_cohort_is_suppressed_everywhere(api):
    _, body = api("GET /v1/read/cohorts/{cohortId}/summary", {"cohortId": "coh2"})
    d = body["data"]
    assert d["learningGain"]["suppressed"] and d["learningGain"]["meanGain"] is None and d["learningGain"]["n"] == 2
    assert all(row["suppressed"] for row in d["byModule"])
    assert api("GET /v1/read/classes/{classId}/summary", {"classId": "cls3"})[1]["data"]["learningGain"]["suppressed"] is True


def test_unknown_cohort_is_404_and_ids_are_validated(api):
    assert api("GET /v1/read/cohorts/{cohortId}/summary", {"cohortId": "nope"})[0] == 404
    assert api("GET /v1/read/cohorts/{cohortId}/summary", {"cohortId": "a#b"})[0] == 400


def test_cohort_list_and_module_and_concept_gain(api):
    _, body = api("GET /v1/read/cohorts")
    assert [c["name"] for c in body["data"]["cohorts"]] == ["Maryvale", "Tiny Cohort"]
    _, body = api("GET /v1/read/modules/{moduleId}/gain", {"moduleId": "m1"}, {"cohortId": "coh1"})
    assert body["data"]["learningGain"]["n"] == 8 and body["data"]["byConcept"][0]["concept"] == "loops"
    _, body = api("GET /v1/read/concepts/gain", query={"cohortId": "coh1"})
    assert body["data"]["concepts"][0]["concept"] == "loops" and body["data"]["concepts"][0]["suppressed"] is False


def test_progress_grouped_by_org_class_and_period(api):
    _, body = api("GET /v1/read/progress", query={"groupBy": "org"})
    assert body["data"]["groups"][0]["name"] == "Maryvale HS" and body["data"]["groups"][0]["enrolled"] == 10
    _, body = api("GET /v1/read/progress", query={"groupBy": "class"})
    assert len(body["data"]["groups"]) == 3
    _, body = api("GET /v1/read/progress", query={"groupBy": "cohort", "from": "2020-01-01", "to": "2020-01-31"})
    assert all(g["completion"]["startedPct"] == 0.0 for g in body["data"]["groups"])
    assert api("GET /v1/read/progress", query={"groupBy": "weird"})[0] == 400
    assert api("GET /v1/read/progress", query={"from": "yesterday"})[0] == 400


def test_responses_never_contain_student_names_or_ids(api):
    for route, path, query in [("GET /v1/read/cohorts/{cohortId}/summary", {"cohortId": "coh1"}, None),
                               ("GET /v1/read/classes/{classId}/summary", {"classId": "cls1"}, None),
                               ("GET /v1/read/progress", None, {"groupBy": "class"})]:
        text = json.dumps(api(route, path, query)[1])
        assert not any(name in text for name in NAMES) and "-s0" not in text
