"""Sets up a class, a student and a published module through the real class API, login and
authorizer. Tests that use it fail if the two halves of the backend disagree on item shapes."""
import json

from support import admin_auth, api_event, load_lambda

MODULE = {"moduleId": "py-loops", "title": "Loops", "lessons": [{"lessonId": "l1", "activities": [
    {"activityId": "pre", "type": "assessment", "role": "pre", "questions": [
        {"questionId": "p1", "type": "mcq", "answerKey": "a", "concept": "loops", "choices": [{"id": "a", "text": "x"}, {"id": "b", "text": "y"}]}]},
    {"activityId": "vid", "type": "video", "provider": "youtube", "videoId": "dQw4w9WgXcQ", "minSeconds": 5},
    {"activityId": "chk", "type": "check", "estimatedMinutes": 1, "questions": [
        {"questionId": "c1", "type": "short", "answerKey": ["for"], "concept": "loops"}]},
    {"activityId": "post", "type": "assessment", "role": "post", "questions": [
        {"questionId": "q1", "type": "mcq", "answerKey": "a", "concept": "loops", "choices": [{"id": "a", "text": "x"}, {"id": "b", "text": "y"}]}]},
]}]}


def run(mod, route, body=None, auth=None, path=None, headers=None, query=None):
    resp = mod.lambda_handler(api_event(route, body, headers=headers, auth=auth, path=path, query=query), None)
    ctype = resp["headers"].get("Content-Type", "")
    return resp["statusCode"], (json.loads(resp["body"]) if ctype == "application/json" else resp["body"])


class Setup:
    def __init__(self, tables):
        self.tables = tables
        core, content = tables["CORE_TABLE"], tables["CONTENT_TABLE"]
        core.put_item(Item={"pk": "ORG#org_1", "sk": "META", "status": "active"})
        content.put_item(Item={"pk": "MOD#py-loops", "sk": "META", "latestVersion": 1})
        content.put_item(Item={"pk": "MOD#py-loops", "sk": "V#0001", "module": MODULE, "version": 1})
        self.classes, self.login_lambda, self.authorizer, self.player = (
            load_lambda(n) for n in ("class-api", "auth-student", "authorizer-student", "student-api"))
        self.admin = admin_auth()
        _, body = run(self.classes, "POST /v1/classes", {"name": "Period 3", "orgId": "org_1"}, self.admin)
        self.class_id, self.join_code = body["data"]["classId"], body["data"]["joinCode"]
        self.cls = {"classId": self.class_id}
        status, _ = run(self.classes, "POST /v1/classes/{classId}/assignments", {"moduleId": "py-loops"}, self.admin, self.cls)
        assert status == 201

    def add_student(self, name):
        status, body = run(self.classes, "POST /v1/classes/{classId}/roster", {"displayName": name}, self.admin, self.cls)
        assert status == 201
        return body["data"]["studentId"], body["data"]["studentCode"]

    def sign_in(self, words):
        status, body = run(self.login_lambda, "POST /v1/auth/student/login", {"classCode": self.join_code, "studentCode": words})
        assert status == 200
        token = body["data"]["sessionToken"]
        decision = self.authorizer.lambda_handler({"headers": {"authorization": f"Bearer {token}"}}, None)
        assert decision["isAuthorized"] is True
        return token, {"lambda": decision["context"]}

    def play(self, student_auth, route, path=None, body=None):
        return run(self.player, route, body, student_auth, path)

    def finish_module(self, student_auth, pre="b", post="a", n=0):
        act = lambda name: {"moduleId": "py-loops", "activityId": name}  # noqa: E731
        submit = lambda name, answers, i: self.play(  # noqa: E731
            student_auth, "POST /v1/student/modules/{moduleId}/activities/{activityId}/submit", act(name),
            {"clientSubmissionId": f"client-sub-{n + i:03d}", "answers": answers})
        submit("pre", [{"questionId": "p1", "value": pre}], 1)
        self.play(student_auth, "POST /v1/student/modules/{moduleId}/activities/{activityId}/heartbeat", act("vid"), {"seconds": 10})
        self.play(student_auth, "POST /v1/student/modules/{moduleId}/activities/{activityId}/complete", act("vid"))
        submit("chk", [{"questionId": "c1", "value": "for"}], 2)
        return submit("post", [{"questionId": "q1", "value": post}], 3)
