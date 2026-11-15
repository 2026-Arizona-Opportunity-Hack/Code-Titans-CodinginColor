"""Coding exercises: the module shape, what students may see, submitting, drafts, and hints."""
import json
import pytest
from support import load_lambda
CLASS_ID, STUDENT = "cls1", "stu1"
SOLUTION = "def add(a, b):\n    return a + b + 0"
TESTS = [
    {"testId": "t1", "label": "add(2, 3) is 5", "kind": "call", "expression": "add(2, 3)", "expected": "5"},
    {"testId": "t2", "label": "add(-1, 1) is 0", "kind": "call", "expression": "add(-1, 1)", "expected": "0"},
    {"testId": "t3", "label": "prints a greeting", "kind": "output", "stdin": "Ana", "expected": "Hello Ana"},
]
def module():
    return {"moduleId": "m1", "title": "Functions", "lessons": [{"lessonId": "l1", "activities": [
        {"activityId": "pre", "type": "assessment", "role": "pre", "questions": [{"questionId": "p1", "type": "mcq", "answerKey": "a", "concept": "functions"}]},
        {"activityId": "code1", "type": "code", "title": "Write add", "body": "Write a function add(a, b) that returns the sum.",
         "language": "python", "starterCode": "def add(a, b):\n    pass\n", "tests": TESTS, "solution": SOLUTION, "passPct": 100},
        {"activityId": "post", "type": "assessment", "role": "post", "questions": [{"questionId": "q1", "type": "mcq", "answerKey": "a", "concept": "functions"}]},
    ]}]}
@pytest.fixture
def player(tables, monkeypatch):
    core, content, progress = tables["CORE_TABLE"], tables["CONTENT_TABLE"], tables["PROGRESS_TABLE"]
    core.put_item(Item={"pk": f"CLS#{CLASS_ID}", "sk": "META"})
    core.put_item(Item={"pk": f"CLS#{CLASS_ID}", "sk": f"STU#{STUDENT}", "displayName": "Ana Rodriguez", "status": "active"})
    core.put_item(Item={"pk": f"CLS#{CLASS_ID}", "sk": "ASG#0001#m1", "moduleId": "m1", "moduleVersion": 1, "order": 1})
    content.put_item(Item={"pk": "MOD#m1", "sk": "V#0001", "module": module()})
    progress.put_item(Item={"pk": f"STU#{STUDENT}", "sk": "ACT#m1#pre", "status": "complete"})
    monkeypatch.setenv("BEDROCK_REGION", "us-west-2")
    monkeypatch.setenv("HINT_MODEL_ID", "amazon.nova-lite-v1:0")
    mod = load_lambda("student-api")
    state = {"calls": [], "reply": "What should the function give back to the caller?"}
    def fake_converse(system, user, max_tokens=300, temperature=0.3):
        state["calls"].append({"system": system, "user": user})
        return {"text": state["reply"], "inputTokens": 80, "outputTokens": 25}
    monkeypatch.setattr("cic.llm.converse", fake_converse)
    def call(route, body=None, path=None):
        event = {"routeKey": route, "headers": {}, "pathParameters": path or {"moduleId": "m1", "activityId": "code1"},
                 "body": json.dumps(body) if body is not None else None,
                 "requestContext": {"requestId": "r", "http": {"method": route.split()[0]},
                                    "authorizer": {"lambda": {"studentId": STUDENT, "classId": CLASS_ID}}}}
        resp = mod.lambda_handler(event, None)
        return resp["statusCode"], json.loads(resp["body"])
    call.state, call.tables = state, tables
    return call
SUBMIT = "POST /v1/student/modules/{moduleId}/activities/{activityId}/submit"
DRAFT = "PUT /v1/student/modules/{moduleId}/activities/{activityId}/draft"
def results(*passed):
    return [{"testId": t["testId"], "passed": p} for t, p in zip(TESTS, passed)]
def sub(player, code="def add(a, b):\n    return a + b\n", passed=(True, True, True), csid="client-sub-001"):
    return player(SUBMIT, {"clientSubmissionId": csid, "code": code, "results": results(*passed)})
def test_student_copy_has_the_tests_but_never_the_solution(player):
    status, body = player("GET /v1/student/modules/{moduleId}", path={"moduleId": "m1"})
    act = next(a for a in body["data"]["lessons"][0]["activities"] if a["activityId"] == "code1")
    assert status == 200 and act["tests"] == TESTS and act["starterCode"].startswith("def add")
    assert "solution" not in act and "return a + b + 0" not in json.dumps(body)
def test_all_tests_passing_completes_the_exercise_and_keeps_the_code(player):
    status, body = sub(player)
    assert status == 200
    assert body["data"]["passed"] is True and body["data"]["scorePct"] == 100.0 and body["data"]["testsPassed"] == 3
    assert body["data"]["activityState"] == "complete"
    item = player.tables["PROGRESS_TABLE"].get_item(Key={"pk": "STU#stu1", "sk": "ACT#m1#code1"})["Item"]
    assert item["status"] == "complete" and item["code"].startswith("def add") and item["selfReported"] is True and item["testsTotal"] == 3
    subs = [i for i in player.tables["PROGRESS_TABLE"].scan()["Items"] if i["sk"].startswith("SUB#code1#")]
    assert len(subs) == 1 and subs[0]["kind"] == "code" and "reviewStatus" not in subs[0] and "gsi2pk" not in subs[0]
def test_submitting_with_failing_tests_still_lets_the_student_move_on(player):
    status, body = sub(player, passed=(False, False, False))
    data = body["data"]
    assert status == 200 and data["passed"] is False and data["scorePct"] == 0 and data["activityState"] == "complete"
    assert data["next"]["type"] in ("activity", "module_complete")  # the next step opens
    status, body = sub(player, passed=(True, False, True), csid="client-sub-002")  # can still improve it
    assert body["data"]["scorePct"] == 66.7 and body["data"]["activityState"] == "complete"
    status, body = sub(player, csid="client-sub-004")
    assert body["data"]["passed"] is True
    sub(player, passed=(False, False, False), csid="client-sub-003")  # a worse later try never undoes it
    item = player.tables["PROGRESS_TABLE"].get_item(Key={"pk": "STU#stu1", "sk": "ACT#m1#code1"})["Item"]
    assert item["status"] == "complete" and float(item["bestScore"]) == 100.0
def test_missing_results_count_as_not_passed_and_pass_mark_is_respected(player):
    status, body = player(SUBMIT, {"clientSubmissionId": "client-sub-009", "code": "x = 1", "results": [{"testId": "t1", "passed": True}]})
    assert status == 200 and body["data"]["testsPassed"] == 1 and body["data"]["scorePct"] == 33.3 and body["data"]["passed"] is False
@pytest.mark.parametrize("body", [
    {"code": "", "results": []},
    {"code": "x" * 6001, "results": []},
    {"code": "x = 1", "results": [{"testId": "nope", "passed": True}]},
    {"code": "x = 1", "results": [{"testId": "t1", "passed": "yes"}]},
    {"code": "x = 1", "results": [{"testId": "t1", "passed": True, "extra": 1}]},
    {"code": "x = 1", "results": results(True, True, True) + results(True)},
    {"code": "x = 1"},
    {"code": 5, "results": []},
])
def test_bad_submissions_are_refused(player, body):
    status, _ = player(SUBMIT, {"clientSubmissionId": "client-sub-100", **body})
    assert status == 400
def test_a_retry_with_the_same_id_does_not_count_twice(player):
    first = sub(player)[1]["data"]
    again = sub(player)[1]["data"]
    assert again["passed"] == first["passed"]
    subs = [i for i in player.tables["PROGRESS_TABLE"].scan()["Items"] if i["sk"].startswith("SUB#code1#")]
    assert len(subs) == 1
def test_submission_limit(player):
    player.tables["PROGRESS_TABLE"].put_item(Item={"pk": "STU#stu1", "sk": "ACT#m1#code1", "status": "in_progress", "attempts": 100})
    status, body = sub(player)
    assert status == 403 and body["code"] == "SUBMISSION_LIMIT"
def test_draft_code_is_saved_and_comes_back_with_the_module(player):
    assert player(DRAFT, {"code": "def add(a, b):\n    return"})[0] == 200
    assert player(DRAFT, {"code": "x" * 6001})[0] == 400
    _, body = player("GET /v1/student/modules/{moduleId}", path={"moduleId": "m1"})
    act = next(a for a in body["data"]["lessons"][0]["activities"] if a["activityId"] == "code1")
    assert act["draftCode"] == "def add(a, b):\n    return"
def test_drafts_are_not_for_other_activity_types(player):
    assert player(DRAFT, {"code": "x"}, path={"moduleId": "m1", "activityId": "pre"})[0] == 400
def test_hint_for_code_gets_the_failing_test_labels_and_keeps_the_solution_secret(player):
    status, body = player("POST /v1/student/hints", {"moduleId": "m1", "activityId": "code1", "code": "def add(a, b):\n    pass",
                                                    "failedTests": ["t1", "bogus"], "question": "my tests fail"})
    assert status == 200 and body["data"]["hint"] == player.state["reply"]
    user = player.state["calls"][0]["user"]
    assert "Tests not passing yet: add(2, 3) is 5" in user and "bogus" not in user
    assert "<do_not_say>" in user and "return a + b + 0" in user  # the model is told what not to give away
    assert "Rodriguez" not in user  # the student's name is never sent
def test_hint_that_gives_away_the_solution_line_is_replaced(player):
    player.state["reply"] = "Just write `return a + b + 0` inside the function."
    status, body = player("POST /v1/student/hints", {"moduleId": "m1", "activityId": "code1", "code": "pass"})
    assert status == 200 and "return a + b" not in body["data"]["hint"]
def test_a_hint_that_gives_away_an_expected_output_is_replaced(player):
    player.state["reply"] = "Print exactly Hello Ana with the name added."
    status, body = player("POST /v1/student/hints", {"moduleId": "m1", "activityId": "code1", "code": "print()"})
    assert "Hello Ana" not in body["data"]["hint"]
