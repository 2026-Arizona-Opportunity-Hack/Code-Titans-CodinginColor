"""External teachers: partner-school teachers who run classes on CIC's curriculum with their own
roster. CIC admins see usage counts for those classes and nothing about their students."""
import json
import pytest
from integration import Setup, run
from support import admin_auth, load_lambda
EXT = admin_auth("[external_teacher]", "ext-1")
EXT2 = admin_auth("[external_teacher]", "ext-2")
INS = admin_auth("[instructor]", "ins-1")
STUDENT_NAME = "Zaphod Q."
@pytest.fixture
def world(tables):
    s = Setup(tables)  # a CIC class "Period 3" with module py-loops assigned
    core = tables["CORE_TABLE"]
    admin_api, reports, read_api = load_lambda("admin-api"), load_lambda("reports-api"), load_lambda("read-api")
    status, body = run(admin_api, "POST /v1/admin/orgs", {"name": "Desert Prep", "kind": "external"}, s.admin)
    assert status == 201 and body["data"]["kind"] == "external"
    s.ext_org = body["data"]["orgId"]
    for sub in ("ext-1", "ext-2"):
        core.put_item(Item={"pk": f"USR#{sub}", "sk": "META", "orgId": s.ext_org})
    core.put_item(Item={"pk": "USR#ins-1", "sk": "META", "orgId": "org_1"})
    status, body = run(s.classes, "POST /v1/classes", {"name": "Intro CS"}, EXT)
    assert status == 201
    s.ext_class, s.ext_code = body["data"]["classId"], body["data"]["joinCode"]
    s.ext_path = {"classId": s.ext_class}
    assert body["data"]["ownerKind"] == "external"
    s.admin_api, s.reports, s.read_api = admin_api, reports, read_api
    return s
def test_external_class_is_kept_out_of_cic_lists(world):
    s = world
    core = s.tables["CORE_TABLE"]
    meta = core.get_item(Key={"pk": f"CLS#{s.ext_class}", "sk": "META"})["Item"]
    assert meta["gsi1pk"] == "LIST#XCLS" and "gsi2pk" not in meta
    _, body = run(s.classes, "GET /v1/classes", auth=s.admin)
    assert [c["classId"] for c in body["data"]] == [s.class_id]
    _, body = run(s.classes, "GET /v1/classes", auth=EXT)
    assert [c["classId"] for c in body["data"]] == [s.ext_class]
    assert run(s.classes, "GET /v1/classes", auth=EXT2)[1]["data"] == []
def test_admin_cannot_open_an_external_class_but_its_teacher_can(world):
    s = world
    for route in ("GET /v1/classes/{classId}", "GET /v1/classes/{classId}/roster", "GET /v1/classes/{classId}/assignments"):
        assert run(s.classes, route, auth=s.admin, path=s.ext_path)[0] == 403
        assert run(s.classes, route, auth=EXT2, path=s.ext_path)[0] == 403
        assert run(s.classes, route, auth=EXT, path=s.ext_path)[0] == 200
    assert run(s.reports, "GET /v1/classes/{classId}/progress", auth=s.admin, path=s.ext_path)[0] == 403
    assert run(s.reports, "GET /v1/classes/{classId}/export", auth=s.admin, path=s.ext_path, query={"type": "progress"})[0] == 403
    assert run(s.reports, "GET /v1/classes/{classId}/progress", auth=EXT, path=s.ext_path)[0] == 200
def test_admin_cannot_write_into_an_external_class(world):
    s = world
    assert run(s.classes, "POST /v1/classes/{classId}/roster", {"displayName": "A B"}, s.admin, s.ext_path)[0] == 403
    assert run(s.classes, "PATCH /v1/classes/{classId}", {"name": "x"}, s.admin, s.ext_path)[0] == 403
    assert run(s.classes, "POST /v1/classes/{classId}/members", {"userId": "ins-1"}, s.admin, s.ext_path)[0] == 403
def test_who_may_create_a_class_where(world):
    s = world
    assert run(s.classes, "POST /v1/classes", {"name": "x", "orgId": s.ext_org}, s.admin)[0] == 403  # admin in an external school
    assert run(s.classes, "POST /v1/classes", {"name": "x", "cohortId": "coh_1"}, EXT)[0] == 400  # no cohorts for external classes
    s.tables["CORE_TABLE"].put_item(Item={"pk": "USR#ins-1", "sk": "META", "orgId": s.ext_org})  # a mix-up in the profile
    assert run(s.classes, "POST /v1/classes", {"name": "x"}, INS)[0] == 403
    s.tables["CORE_TABLE"].put_item(Item={"pk": "USR#ext-2", "sk": "META", "orgId": "org_1"})
    assert run(s.classes, "POST /v1/classes", {"name": "x"}, EXT2)[0] == 403
def test_external_class_cannot_join_a_cohort_or_search_results(world):
    s = world
    status, body = run(s.admin_api, "POST /v1/admin/cohorts", {"name": "Spring"}, s.admin)
    cohort = {"cohortId": body["data"]["cohortId"]}
    status, _ = run(s.admin_api, "PATCH /v1/admin/cohorts/{cohortId}", {"classIds": [s.ext_class]}, s.admin, cohort)
    assert status == 400
    run(s.classes, "POST /v1/classes/{classId}/roster", {"displayName": STUDENT_NAME}, EXT, s.ext_path)
    _, body = run(s.classes, "GET /v1/students", auth=s.admin, query={"q": "zaphod"})
    assert body["data"] == []
    _, body = run(s.classes, "GET /v1/students", auth=EXT, query={"q": "zaphod"})
    assert [r["displayName"] for r in body["data"]] == [STUDENT_NAME]
def test_usage_report_has_counts_and_no_student_data(world):
    s = world
    assert run(s.classes, "POST /v1/classes/{classId}/assignments", {"moduleId": "py-loops"}, EXT, s.ext_path)[0] == 201
    status, body = run(s.classes, "POST /v1/classes/{classId}/roster", {"displayName": STUDENT_NAME}, EXT, s.ext_path)
    words = body["data"]["studentCode"]
    run(s.classes, "POST /v1/classes/{classId}/roster", {"displayName": "Second Student"}, EXT, s.ext_path)
    status, body = run(s.login_lambda, "POST /v1/auth/student/login", {"classCode": s.ext_code, "studentCode": words})
    assert status == 200
    token = body["data"]["sessionToken"]
    auth = {"lambda": s.authorizer.lambda_handler({"headers": {"authorization": f"Bearer {token}"}}, None)["context"]}
    act = {"moduleId": "py-loops", "activityId": "vid"}
    assert s.play(auth, "POST /v1/student/modules/{moduleId}/activities/{activityId}/heartbeat", act, {"seconds": 10})[0] == 200
    status, raw = run(s.reports, "GET /v1/admin/usage", auth=s.admin)
    assert status == 200
    data = raw["data"]
    assert data["totals"] == {"schools": 1, "classes": 1, "students": 2, "studentsActiveLast7Days": 1}
    school = data["schools"][0]
    assert school["name"] == "Desert Prep" and school["lastActivityAt"]
    cls = school["classList"][0]
    assert cls["name"] == "Intro CS" and cls["students"] == 2 and cls["modulesAssigned"] == 1
    text = json.dumps(raw)
    for secret in (STUDENT_NAME, "Second Student", words, s.ext_code, "studentId", "stu_"):
        assert secret not in text
def test_usage_report_is_admin_only(world):
    s = world
    for who in (EXT, INS, admin_auth("[reviewer]", "rev-1")):
        assert run(s.reports, "GET /v1/admin/usage", auth=who)[0] == 403
def test_read_api_never_reports_on_external_classes(world):
    s = world
    from cic import classdata
    assert [m["pk"] for m in classdata.class_metas()] == [f"CLS#{s.class_id}"]
    with pytest.raises(Exception):
        classdata.require_cic_class(s.ext_class)
    classdata.require_cic_class(s.class_id)
    auth = {"lambda": {"keyId": "k1", "scopes": "read:cohorts"}}
    assert run(s.read_api, "GET /v1/read/classes/{classId}/summary", auth=auth, path=s.ext_path)[0] == 404
    assert run(s.read_api, "GET /v1/read/progress", auth=auth, query={"classId": s.ext_class})[0] == 404
def test_publishing_by_an_admin_leaves_external_classes_on_their_version(world):
    s = world
    run(s.classes, "POST /v1/classes/{classId}/assignments", {"moduleId": "py-loops"}, EXT, s.ext_path)
    core = s.tables["CORE_TABLE"]
    curriculum = load_lambda("curriculum-api")
    _, body = run(curriculum, "GET /v1/curriculum/modules/{moduleId}/classes", auth=s.admin, path={"moduleId": "py-loops"})
    assert [c["classId"] for c in body["data"]["classes"]] == [s.class_id]
    _, body = run(curriculum, "GET /v1/curriculum/modules/{moduleId}/classes", auth=EXT, path={"moduleId": "py-loops"})
    assert [c["classId"] for c in body["data"]["classes"]] == [s.ext_class]
