"""Instructor reports on data produced by the real class API, login and student player."""
from integration import Setup, run
from support import load_lambda


def test_reports_see_what_students_did(tables):
    s = Setup(tables)
    reports = load_lambda("reports-api")
    done = []
    for name, post in (("Ana R.", "a"), ("Ben T.", "b"), ("Cy P.", "a")):
        sid, words = s.add_student(name)
        _, student = s.sign_in(words)
        s.finish_module(student, pre="b", post=post)
        done.append(sid)
    s.add_student("Di K.")  # never starts
    cls = s.cls

    _, body = run(reports, "GET /v1/classes/{classId}/progress", auth=s.admin, path=cls)
    rows = {r["displayName"]: r["modules"]["py-loops"] for r in body["data"]["students"]}
    assert rows["Ana R."]["state"] == "complete" and rows["Di K."]["state"] == "available"
    assert [r["rosterNumber"] for r in body["data"]["students"]] == [1, 2, 3, 4]

    _, body = run(reports, "GET /v1/classes/{classId}/modules/{moduleId}/gain", auth=s.admin, path={**cls, "moduleId": "py-loops"})
    d = body["data"]
    assert d["class"]["n"] == 3 and d["class"]["nEnrolled"] == 4
    assert (d["class"]["meanPre"], d["class"]["meanPost"]) == (0.0, 66.7)  # everyone missed the pretest; two of three passed the post-test
    assert {r["displayName"]: r["gain"] for r in d["students"]}["Ben T."] == 0.0

    _, body = run(reports, "GET /v1/classes/{classId}/concepts", auth=s.admin, path=cls)
    assert body["data"]["concepts"][0]["concept"] == "loops"

    status, text = run(reports, "GET /v1/classes/{classId}/export", auth=s.admin, path=cls, query={"type": "gain"})
    assert status == 200 and text.startswith("module,rosterNumber,student") and "Ana R." in text
