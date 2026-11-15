"""The module document accepts coding exercises and says what is missing before one can be published."""
import copy
import pytest
from support import load_lambda
@pytest.fixture(scope="module")
def moduledoc():
    load_lambda("curriculum-api")
    import moduledoc as m
    return m
def doc():
    pre = {"activityId": "pre", "type": "assessment", "role": "pre", "title": "Pretest", "questions": [
        {"questionId": "p1", "type": "mcq", "prompt": "q", "choices": [{"id": "a", "text": "x"}, {"id": "b", "text": "y"}], "answerKey": "a", "concept": "functions"}]}
    post = copy.deepcopy(pre) | {"activityId": "post", "role": "post", "title": "Post-test"}
    post["questions"][0]["questionId"] = "q1"
    code = {"activityId": "c1", "type": "code", "title": "Write add", "body": "Write add(a, b).", "language": "python",
            "starterCode": "def add(a, b):\n    pass\n", "solution": "def add(a, b):\n    return a + b",
            "tests": [{"testId": "t1", "label": "add(2, 3) is 5", "kind": "call", "expression": "add(2, 3)", "expected": "5"},
                      {"testId": "t2", "label": "greets", "kind": "output", "stdin": "Ana", "expected": "Hello Ana"}]}
    return {"moduleId": "m1", "title": "Functions", "lessons": [{"lessonId": "l1", "title": "L", "activities": [pre, code, post]}]}
def test_a_valid_exercise_saves_and_publishes(moduledoc):
    assert moduledoc.check_draft(doc(), "m1") == []
    assert moduledoc.publish_problems(doc()) == []
@pytest.mark.parametrize("change,path", [
    (lambda a: a.update(language="java"), "language"),
    (lambda a: a.update(starterCode="x" * 4001), "starterCode"),
    (lambda a: a.update(solution=5), "solution"),
    (lambda a: a.update(passPct=101), "passPct"),
    (lambda a: a.update(surprise=1), "surprise"),
    (lambda a: a.update(tests="nope"), "tests"),
    (lambda a: a.update(tests=[{"testId": f"t{i}", "label": "x", "kind": "output", "expected": "x"} for i in range(21)]), "tests"),
    (lambda a: a["tests"][0].update(kind="eval"), "kind"),
    (lambda a: a["tests"][0].update(label=None), "label"),
    (lambda a: a["tests"][0].update(expected="x" * 1001), "expected"),
    (lambda a: a["tests"][0].update(stdin="hi"), "stdin"),
    (lambda a: a["tests"][1].update(expression="1 + 1"), "expression"),
    (lambda a: a["tests"][0].update(extra=1), "extra"),
    (lambda a: a["tests"][1].update(testId="t1"), "testId"),
])
def test_bad_exercises_are_refused_with_the_path(moduledoc, change, path):
    d = doc()
    change(d["lessons"][0]["activities"][1])
    problems = moduledoc.check_draft(d, "m1")
    assert problems and any(path in p["path"] for p in problems)
def test_publishing_needs_instructions_and_complete_tests(moduledoc):
    d = doc()
    act = d["lessons"][0]["activities"][1]
    act["body"] = " "
    act["tests"][0]["expression"] = ""
    act["tests"][1]["expected"] = ""
    paths = [p["path"] for p in moduledoc.publish_problems(d)]
    assert any(p.endswith("activities[1].body") for p in paths)
    assert any(p.endswith("tests[0].expression") for p in paths)
    assert any(p.endswith("tests[1].expected") for p in paths)
def test_an_exercise_with_no_tests_cannot_be_published(moduledoc):
    d = doc()
    d["lessons"][0]["activities"][1]["tests"] = []
    assert any(p["path"].endswith("activities[1].tests") for p in moduledoc.publish_problems(d))
