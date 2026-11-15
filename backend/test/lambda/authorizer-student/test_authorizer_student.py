import pytest
from support import load_lambda


@pytest.fixture
def authz():
    return load_lambda("authorizer-student")


def event(token):
    return {"headers": {"Authorization": f"Bearer {token}"} if token else {}}


def new_session(version=1):
    from cic import sessions
    return sessions.create_session("stu_01", "cls_01", version)[0]


def set_roster(table, **values):
    names = {f"#{k}": k for k in values}
    table.update_item(Key={"pk": "CLS#cls_01", "sk": "STU#stu_01"},
                      UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in values),
                      ExpressionAttributeNames=names,
                      ExpressionAttributeValues={f":{k}": v for k, v in values.items()})


def test_valid_session_allows_with_context(authz, seeded):
    out = authz.lambda_handler(event(new_session()), None)
    assert out == {"isAuthorized": True, "context": {"studentId": "stu_01", "classId": "cls_01"}}


def test_missing_and_unknown_tokens_denied(authz, seeded):
    assert authz.lambda_handler(event(None), None)["isAuthorized"] is False
    assert authz.lambda_handler(event("ses_unknown"), None)["isAuthorized"] is False


def test_expired_session_denied(authz, seeded):
    from cic import sessions
    token, _ = sessions.create_session("stu_01", "cls_01", 1, now=1000)
    assert authz.lambda_handler(event(token), None)["isAuthorized"] is False


def test_credential_reset_invalidates_session(authz, seeded, table):
    token = new_session(version=1)
    set_roster(table, credVersion=2)
    assert authz.lambda_handler(event(token), None)["isAuthorized"] is False


def test_deactivated_student_denied(authz, seeded, table):
    token = new_session()
    set_roster(table, status="inactive")
    assert authz.lambda_handler(event(token), None)["isAuthorized"] is False
