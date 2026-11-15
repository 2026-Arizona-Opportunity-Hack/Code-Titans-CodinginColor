import json
import time

import pytest
from support import load_lambda

CLS = "cls1"
STUDENTS = {f"s{i}": {"name": n, "pre": pre, "post": post} for i, (n, pre, post) in enumerate(
    [("Ana R.", 40, 80), ("=SUM(A1)", 50, 70), ("Cy T.", 60, 90), ("Di K.", 40, 60), ("Eli M.", 10, 50)], start=1)}
NOW_MS = int(time.time() * 1000)


def module():
    return {"moduleId": "m1", "title": "Loops", "lessons": [{"lessonId": "l1", "activities": [
        {"activityId": "pre", "type": "assessment", "role": "pre"},
        {"activityId": "chk", "type": "check", "estimatedMinutes": 1},
        {"activityId": "post", "type": "assessment", "role": "post"}]}]}


def asm(sid, role, score, correct):
    return {"pk": f"STU#{sid}", "sk": f"ASM#m1#{role}", "classId": CLS, "moduleId": "m1", "role": role, "scorePct": score,
            "byConcept": {"loops": {"correct": correct, "total": 4, "items": 4}}, "gsi1pk": f"CLS#{CLS}#ASM#m1", "gsi1sk": f"{role}#{sid}"}


@pytest.fixture
def api(tables):
    core, progress = tables["CORE_TABLE"], tables["PROGRESS_TABLE"]
    tables["CONTENT_TABLE"].put_item(Item={"pk": "MOD#m1", "sk": "V#0001", "module": module()})
    core.put_item(Item={"pk": f"CLS#{CLS}", "sk": "META", "name": "Maryvale A", "cohortId": "coh1", "gsi2pk": "COH#coh1", "gsi2sk": f"CLS#{CLS}"})
    core.put_item(Item={"pk": f"CLS#{CLS}", "sk": "INS#u1"})
    core.put_item(Item={"pk": f"CLS#{CLS}", "sk": "ASG#0001#m1", "moduleId": "m1", "moduleVersion": 1, "order": 1, "assignedAt": "2020-01-01T00:00:00Z"})
    for n, (sid, s) in enumerate(STUDENTS.items(), start=1):
        core.put_item(Item={"pk": f"CLS#{CLS}", "sk": f"STU#{sid}", "displayName": s["name"], "rosterNumber": n, "status": "active", "createdAt": "2020-01-01T00:00:00Z"})
        progress.put_item(Item=asm(sid, "pre", s["pre"], -(-s["pre"] * 4 // 100)))
        progress.put_item(Item=asm(sid, "post", s["post"], -(-s["post"] * 4 // 100)))
        state = "complete" if sid in ("s1", "s2", "s3") else "in_progress"
        progress.put_item(Item={"pk": f"STU#{sid}", "sk": "MOD#m1", "state": state, "gsi1pk": f"CLS#{CLS}#MOD#m1", "gsi1sk": f"STU#{sid}"})
    core.put_item(Item={"pk": f"CLS#{CLS}", "sk": "STU#s6", "displayName": "Fay N.", "rosterNumber": 6, "status": "active", "createdAt": "2020-01-01T00:00:00Z"})
    for sid in ("s1", "s2", "s3"):
        for act in ("pre", "chk", "post"):
            progress.put_item(Item={"pk": f"STU#{sid}", "sk": f"ACT#m1#{act}", "status": "complete", "attempts": 1, "lastActiveAt": NOW_MS, "activeSeconds": 60})
    progress.put_item(Item={"pk": "STU#s5", "sk": "ACT#m1#pre", "status": "complete", "attempts": 1, "lastActiveAt": NOW_MS})
    progress.put_item(Item={"pk": "STU#s4", "sk": "ACT#m1#pre", "status": "complete", "attempts": 1, "lastActiveAt": NOW_MS})
    progress.put_item(Item={"pk": "STU#s4", "sk": "ACT#m1#chk", "status": "in_progress", "attempts": 3, "activeSeconds": 300, "lastActiveAt": NOW_MS})
    mod = load_lambda("reports-api")

    def call(route, path=None, groups="[instructor]", sub="u1", query=None, body=None):
        claims = {"sub": sub, "cognito:groups": groups}
        event = {"routeKey": route, "pathParameters": path or {"classId": CLS}, "queryStringParameters": query,
                 "body": json.dumps(body) if body is not None else None, "headers": {},
                 "requestContext": {"requestId": "r", "http": {"method": route.split()[0]}, "authorizer": {"jwt": {"claims": claims}}}}
        resp = mod.lambda_handler(event, None)
        return resp["statusCode"], (json.loads(resp["body"]) if resp["headers"]["Content-Type"] == "application/json" else resp["body"]), resp

    return call


def test_only_members_and_admins_can_read_a_class(api):
    route = "GET /v1/classes/{classId}/progress"
    assert api(route)[0] == 200
    assert api(route, sub="stranger")[0] == 403
    assert api(route, groups="[reviewer]")[0] == 403
    assert api(route, groups="[cic_admin]", sub="admin")[0] == 200
    assert api(route, path={"classId": "a#b"})[0] == 400


def test_progress_matrix_lists_every_active_student(api):
    _, body, _ = api("GET /v1/classes/{classId}/progress")
    rows = {s["displayName"]: s for s in body["data"]["students"]}
    assert len(rows) == 6
    assert rows["Ana R."]["modules"]["m1"] == {"state": "complete", "percent": 100, "activeMinutes": 3}
    assert rows["Fay N."]["modules"]["m1"]["state"] == "available"


def test_module_gain_per_student_and_class(api):
    _, body, _ = api("GET /v1/classes/{classId}/modules/{moduleId}/gain", {"classId": CLS, "moduleId": "m1"})
    d = body["data"]
    assert d["class"]["n"] == 5 and d["class"]["nEnrolled"] == 6
    assert (d["class"]["meanPre"], d["class"]["meanPost"], d["class"]["meanGain"], d["class"]["normalizedGain"]) == (40.0, 70.0, 30.0, 0.5)
    ana = next(s for s in d["students"] if s["displayName"] == "Ana R.")
    assert ana["gain"] == 40.0 and ana["rosterNumber"] == 1
    fay = next(s for s in d["students"] if s["displayName"] == "Fay N.")
    assert fay["pre"] is None and fay["gain"] is None
    assert d["byConcept"][0]["concept"] == "loops"
    assert api("GET /v1/classes/{classId}/modules/{moduleId}/gain", {"classId": CLS, "moduleId": "nope"})[0] == 404


def test_concepts_include_mastery(api):
    _, body, _ = api("GET /v1/classes/{classId}/concepts")
    loops = body["data"]["concepts"][0]
    assert loops["concept"] == "loops" and loops["n"] == 5 and loops["masteryPct"] == 40  # post concept scores 100, 75, 100, 75, 50: two of five reach 80%


def test_attention_lists_stuck_and_not_started(api):
    _, body, _ = api("GET /v1/classes/{classId}/attention")
    d = body["data"]
    assert [s["displayName"] for s in d["notStarted"]] == ["Fay N."]
    stuck = {s["displayName"]: s for s in d["stuck"]}
    assert set(stuck["Di K."]["reasons"]) == {"repeated_attempts", "taking_longer_than_expected"}


def test_student_detail_shows_scores_and_activity_time(api):
    _, body, _ = api("GET /v1/classes/{classId}/students/{studentId}/progress", {"classId": CLS, "studentId": "s1"})
    m = body["data"]["modules"][0]
    assert (m["pre"], m["post"]) == (40.0, 80.0) and m["activities"][0]["state"] == "complete"
    assert api("GET /v1/classes/{classId}/students/{studentId}/progress", {"classId": CLS, "studentId": "ghost"})[0] == 404


def test_export_is_csv_with_formula_injection_neutralized_and_audited(api, tables):
    status, text, resp = api("GET /v1/classes/{classId}/export", query={"type": "gain"})
    assert status == 200 and resp["headers"]["Content-Type"].startswith("text/csv")
    assert "'=SUM(A1)" in text and ",=SUM" not in text
    assert tables["EVENTS_TABLE"].scan()["Count"] == 1
    assert api("GET /v1/classes/{classId}/export", query={"type": "bogus"})[0] == 400
    assert api("GET /v1/classes/{classId}/export", query={"type": "progress"})[0] == 200


def test_review_queue_and_review(api, tables):
    ts = NOW_MS
    tables["PROGRESS_TABLE"].put_item(Item={"pk": "STU#s1", "sk": f"SUB#ws#{ts:013d}", "classId": CLS, "moduleId": "m1", "activityId": "ws",
                                            "answers": {"f2": "notes"}, "submittedAt": ts, "reviewStatus": "pending",
                                            "gsi2pk": f"CLS#{CLS}#REVIEW", "gsi2sk": f"{ts:013d}#s1"})
    _, body, _ = api("GET /v1/classes/{classId}/review-queue")
    item = body["data"][0]
    assert item["student"]["displayName"] == "Ana R." and item["answers"] == {"f2": "notes"}
    sub_id = item["submissionId"]
    path = {"classId": CLS, "submissionId": sub_id}
    assert api("PUT /v1/classes/{classId}/submissions/{submissionId}/review", path, body={"score": 150})[0] == 400
    assert api("PUT /v1/classes/{classId}/submissions/{submissionId}/review", path, body={"score": 85, "comment": "Nice"})[0] == 200
    assert api("GET /v1/classes/{classId}/review-queue")[1]["data"] == []
    saved = tables["PROGRESS_TABLE"].get_item(Key={"pk": "STU#s1", "sk": f"SUB#ws#{ts:013d}"})["Item"]
    assert saved["reviewStatus"] == "reviewed" and saved["reviewScore"] == 85 and "gsi2pk" not in saved


def test_cannot_review_a_submission_from_another_class(api, tables):
    ts = NOW_MS
    tables["PROGRESS_TABLE"].put_item(Item={"pk": "STU#other", "sk": f"SUB#ws#{ts:013d}", "classId": "someone-else", "reviewStatus": "pending"})
    path = {"classId": CLS, "submissionId": f"other:ws:{ts}"}
    assert api("PUT /v1/classes/{classId}/submissions/{submissionId}/review", path, body={"score": 50})[0] == 404


def test_cohort_summary_is_admin_only(api):
    route, path = "GET /v1/admin/cohorts/{cohortId}/summary", {"cohortId": "coh1"}
    assert api(route, path)[0] == 403  # instructor
    status, body, _ = api(route, path, groups="[cic_admin]", sub="admin")
    d = body["data"]
    assert status == 200 and d["classes"] == 1 and d["enrolled"] == 6
    assert d["completion"]["completionPct"] == 50.0  # 3 of 6 students complete
    assert d["learningGain"]["meanGain"] == 30.0 and d["byClass"][0]["name"] == "Maryvale A"


def test_school_days_skip_weekends():
    import reports_service as svc
    day = 24 * 3600 * 1000
    monday = 1_704_067_200_000 + 0  # 2024-01-01 is a Monday (UTC midnight)
    assert svc.school_days_between(monday, monday + 3 * day) == 3          # Mon, Tue, Wed
    assert svc.school_days_between(monday + 4 * day, monday + 7 * day) == 1  # Fri, Sat, Sun -> Friday only
    assert svc.school_days_between(monday + 5 * day, monday + 7 * day) == 0  # a weekend
    assert svc.school_days_between(monday, monday) == 0


def test_inactive_students_are_flagged_and_class_settings_are_respected(api, tables):
    old = NOW_MS - 10 * 24 * 3600 * 1000  # at least 6 school days ago
    tables["PROGRESS_TABLE"].put_item(Item={"pk": "STU#s5", "sk": "ACT#m1#pre", "status": "complete", "attempts": 1, "lastActiveAt": old})
    reasons = {s["displayName"]: s["reasons"] for s in api("GET /v1/classes/{classId}/attention")[1]["data"]["stuck"]}
    assert reasons["Eli M."] == ["inactive"]
    tables["CORE_TABLE"].update_item(Key={"pk": f"CLS#{CLS}", "sk": "META"}, UpdateExpression="SET settings = :s",
                                     ExpressionAttributeValues={":s": {"stuckFailedAttempts": 5, "inactiveSchoolDays": 14}})
    after = {s["displayName"]: s["reasons"] for s in api("GET /v1/classes/{classId}/attention")[1]["data"]["stuck"]}
    assert "Eli M." not in after and after["Di K."] == ["taking_longer_than_expected"]


def test_not_started_waits_from_the_later_of_roster_and_assignment_time(api, tables):
    recent = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    tables["CORE_TABLE"].update_item(Key={"pk": f"CLS#{CLS}", "sk": "STU#s6"}, UpdateExpression="SET createdAt = :c",
                                     ExpressionAttributeValues={":c": recent})
    assert api("GET /v1/classes/{classId}/attention")[1]["data"]["notStarted"] == []  # added just now, so not waiting yet


def test_students_leaning_on_hints_are_flagged(api, tables):
    tables["PROGRESS_TABLE"].put_item(Item={"pk": "STU#s5", "sk": "ACT#m1#chk", "status": "in_progress", "attempts": 1, "hintCount": 3,
                                            "lastActiveAt": NOW_MS})
    stuck = {s["displayName"]: s["reasons"] for s in api("GET /v1/classes/{classId}/attention")[1]["data"]["stuck"]}
    assert stuck["Eli M."] == ["asked_for_hints"]
