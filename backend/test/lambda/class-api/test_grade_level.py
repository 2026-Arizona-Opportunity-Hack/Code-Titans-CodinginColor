import json

import pytest
from support import api_event

INS = ("[instructor]", "ins-1")


def call(api, route, body=None, path=None, query=None):
    auth = {"jwt": {"claims": {"sub": INS[1], "cognito:groups": INS[0]}}}
    resp = api.lambda_handler(api_event(route, body, auth=auth, path=path, query=query), None)
    return resp["statusCode"], json.loads(resp["body"])


@pytest.fixture
def cls(api):
    return call(api, "POST /v1/classes", {"name": "P3"})[1]["data"]["classId"]


def roster(api, cls):
    return {s["displayName"]: s for s in call(api, "GET /v1/classes/{classId}/roster", path={"classId": cls})[1]["data"]}


def test_add_student_with_a_grade(api, cls):
    status, body = call(api, "POST /v1/classes/{classId}/roster", {"displayName": "Ana", "gradeLevel": 9}, path={"classId": cls})
    assert status == 201 and body["data"]["gradeLevel"] == 9
    assert roster(api, cls)["Ana"]["gradeLevel"] == 9


def test_grade_is_optional(api, cls):
    body = call(api, "POST /v1/classes/{classId}/roster", {"displayName": "Ben"}, path={"classId": cls})[1]
    assert body["data"]["gradeLevel"] is None


@pytest.mark.parametrize("grade", [5, 13, 0, "ninth", True, 9.5, [9]])
def test_bad_grades_are_refused(api, cls, grade):
    status, body = call(api, "POST /v1/classes/{classId}/roster", {"displayName": "X", "gradeLevel": grade}, path={"classId": cls})
    assert status == 400 and "grade" in body["error"]


def test_change_and_clear_a_grade(api, cls):
    sid = call(api, "POST /v1/classes/{classId}/roster", {"displayName": "Cy", "gradeLevel": 10}, path={"classId": cls})[1]["data"]["studentId"]
    path = {"classId": cls, "studentId": sid}
    assert call(api, "PATCH /v1/classes/{classId}/roster/{studentId}", {"gradeLevel": 11}, path=path)[1]["data"]["gradeLevel"] == 11
    assert call(api, "PATCH /v1/classes/{classId}/roster/{studentId}", {"gradeLevel": None}, path=path)[1]["data"]["gradeLevel"] is None
    out = call(api, "PATCH /v1/classes/{classId}/roster/{studentId}", {"displayName": "Cy S.", "gradeLevel": 12}, path=path)[1]["data"]
    assert (out["displayName"], out["gradeLevel"]) == ("Cy S.", 12)
    assert call(api, "PATCH /v1/classes/{classId}/roster/{studentId}", {"gradeLevel": 4}, path=path)[0] == 400


def test_import_reads_the_grade_column(api, cls):
    csv = "displayName,externalId,gradeLevel,dob\nAna,1,9,2010-01-01\nBen,2,,\nCy,3,13,\n"
    _, dry = call(api, "POST /v1/classes/{classId}/roster/import", {"csv": csv}, path={"classId": cls}, query={"dryRun": "true"})
    assert dry["data"]["ignoredColumns"] == ["dob"] and dry["data"]["toCreate"] == 2
    assert dry["data"]["errors"] == [{"row": 3, "reason": "gradeLevel must be a grade from 6 to 12, or empty"}]
    call(api, "POST /v1/classes/{classId}/roster/import", {"csv": csv}, path={"classId": cls})
    got = roster(api, cls)
    assert (got["Ana"]["gradeLevel"], got["Ben"]["gradeLevel"]) == (9, None) and "Cy" not in got


def test_reimport_updates_the_grade_but_an_empty_cell_keeps_it(api, cls):
    call(api, "POST /v1/classes/{classId}/roster/import", {"csv": "displayName,externalId,gradeLevel\nAna,1,9\nBen,2,10\n"}, path={"classId": cls})
    call(api, "POST /v1/classes/{classId}/roster/import", {"csv": "displayName,externalId,gradeLevel\nAna,1,10\nBen,2,\n"}, path={"classId": cls})
    got = roster(api, cls)
    assert (got["Ana"]["gradeLevel"], got["Ben"]["gradeLevel"]) == (10, 10)


def test_student_list_shows_the_grade(api, cls):
    call(api, "POST /v1/classes/{classId}/roster", {"displayName": "Ana", "gradeLevel": 9}, path={"classId": cls})
    hits = call(api, "GET /v1/students", query={"q": ""})[1]["data"]
    assert hits[0]["gradeLevel"] == 9
