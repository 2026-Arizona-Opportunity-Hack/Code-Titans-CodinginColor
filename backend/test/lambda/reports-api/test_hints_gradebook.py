import csv
import io

import pytest
from test_reports_api import CLS, NOW_MS, api  # noqa: F401  (the shared class fixture)


@pytest.fixture
def hints(tables, api):  # noqa: F811
    events = tables["EVENTS_TABLE"]
    log = [("s1", "loops", "why does my loop never stop?"), ("s1", "loops", "still stuck"), ("s4", "loops", "what is range"),
           ("s4", "conditions", "if or elif?"), ("s2", None, "help")]
    for n, (sid, concept, question) in enumerate(log):
        events.put_item(Item={"pk": f"HINT#{CLS}", "sk": f"{NOW_MS + n:013d}#{sid}", "studentId": sid, "moduleId": "m1",
                              "activityId": "chk", "concepts": [concept] if concept else [], "level": 1 + n % 2,
                              "question": question, "hint": "What happens to i each time?", "filtered": False})
    tables["PROGRESS_TABLE"].update_item(Key={"pk": "STU#s1", "sk": "ACT#m1#chk"}, UpdateExpression="SET bestScore = :b",
                                         ExpressionAttributeValues={":b": 75})
    return api


def test_hint_report_says_what_to_reteach(hints):
    status, body, _ = hints("GET /v1/classes/{classId}/hints")
    data = body["data"]
    assert status == 200 and data["totals"] == {"hints": 5, "studentsWhoAsked": 3, "enrolled": 6}
    assert data["reteachFirst"] == "loops"
    assert data["concepts"][0] == {"concept": "loops", "hints": 3, "students": 2, "studentPct": 33}
    assert data["activities"][0]["activityTitle"] == "check" and data["activities"][0]["hints"] == 5
    assert data["students"][0]["displayName"] == "Ana R." and data["students"][0]["hints"] == 2
    assert data["recent"][0]["question"] == "help" and len(data["recent"]) == 5  # newest first, for the teacher to review


def test_gradebook_has_scores_gain_and_hints_per_student(hints):
    status, body, _ = hints("GET /v1/classes/{classId}/gradebook")
    rows = {s["displayName"]: s for s in body["data"]["students"]}
    ana = rows["Ana R."]["modules"]["m1"]
    assert status == 200 and body["data"]["modules"] == [{"moduleId": "m1", "title": "Loops"}]
    assert (ana["percent"], ana["score"], ana["pre"], ana["post"], ana["gain"], ana["hints"]) == (100, 75.0, 40.0, 80.0, 40.0, 2)
    assert rows["Ana R."]["overall"]["mostHelpOn"] == "loops"
    assert rows["Fay N."]["overall"]["hints"] == 0 and rows["Fay N."]["modules"]["m1"]["pre"] is None


def test_gradebook_downloads_as_a_safe_csv(hints):
    status, text, resp = hints("GET /v1/classes/{classId}/export", query={"type": "gradebook"})
    assert status == 200 and resp["headers"]["Content-Type"].startswith("text/csv")
    assert 'filename="gradebook-cls1.csv"' in resp["headers"]["Content-Disposition"]
    rows = list(csv.reader(io.StringIO(text)))
    assert rows[0][:4] == ["rosterNumber", "student", "gradeLevel", "Loops complete %"] and "total hints" in rows[0]
    assert len(rows) == 7  # header + 6 students
    assert any(r[1].startswith("'=") for r in rows[1:])  # a name that looks like a formula is neutralised


def test_reviewers_and_other_instructors_cannot_see_hints_or_grades(hints):
    for route in ("GET /v1/classes/{classId}/hints", "GET /v1/classes/{classId}/gradebook"):
        assert hints(route, groups="[reviewer]", sub="r1")[0] == 403
        assert hints(route, sub="someone-else")[0] == 403


def test_untagged_hints_point_at_the_step_instead(tables, api):  # noqa: F811
    for n in range(3):
        tables["EVENTS_TABLE"].put_item(Item={"pk": f"HINT#{CLS}", "sk": f"{NOW_MS + n:013d}#s1", "studentId": "s1",
                                              "moduleId": "m1", "activityId": "chk", "concepts": [], "level": 1,
                                              "question": "help", "hint": "Try printing i.", "filtered": False})
    _, body, _ = api("GET /v1/classes/{classId}/hints")
    assert body["data"]["reteachFirst"] == "Loops: check" and body["data"]["reteachFirstIsStep"] is True
    _, book, _ = api("GET /v1/classes/{classId}/gradebook")
    ana = next(s for s in book["data"]["students"] if s["displayName"] == "Ana R.")
    assert ana["overall"]["mostHelpOn"] == "Loops"
