import time

from conftest import load_lambda

from cic import keys

TOKEN = "ses_" + "a" * 40


def seed(core, *, ttl=None, cred=1, session_cred=1, status="active"):
    core.put_item(Item={"pk": keys.session_pk(keys.sha256_hex(TOKEN)), "sk": "META", "studentId": "s1", "classId": "c1",
                        "credVersion": session_cred, "ttl": ttl or int(time.time()) + 3600})
    core.put_item(Item={"pk": "STU#s1", "sk": "META", "classId": "c1", "credVersion": cred})
    core.put_item(Item={"pk": "CLS#c1", "sk": "STU#s1", "status": status})


def test_valid_session_returns_student_context(tables):
    seed(tables["CORE_TABLE"])
    auth = load_lambda("authorizer-student")
    out = auth.lambda_handler({"headers": {"authorization": f"Bearer {TOKEN}"}}, None)
    assert out == {"isAuthorized": True, "context": {"studentId": "s1", "classId": "c1"}}


def test_denies_missing_unknown_expired_reset_and_inactive(tables):
    core, auth = tables["CORE_TABLE"], load_lambda("authorizer-student")
    call = lambda h: auth.lambda_handler({"headers": h}, None)["isAuthorized"]  # noqa: E731
    assert call({}) is False
    assert call({"authorization": f"Bearer {TOKEN}"}) is False  # unknown token
    assert call({"authorization": "Bearer not-a-session"}) is False
    seed(core, ttl=int(time.time()) - 1)
    assert call({"authorization": f"Bearer {TOKEN}"}) is False  # expired
    seed(core, cred=2, session_cred=1)
    assert call({"authorization": f"Bearer {TOKEN}"}) is False  # credential was reset
    seed(core, status="inactive")
    assert call({"authorization": f"Bearer {TOKEN}"}) is False  # deactivated


def test_fails_closed_when_the_database_errors(monkeypatch):
    auth = load_lambda("authorizer-student")
    monkeypatch.delenv("CORE_TABLE", raising=False)
    assert auth.lambda_handler({"headers": {"authorization": f"Bearer {TOKEN}"}}, None) == {"isAuthorized": False}
