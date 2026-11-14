from conftest import load_lambda

from cic import keys

SECRET = "s3cr3t_with-chars"
KEY = f"cic_abcd1234_{SECRET}"


def seed(core, **extra):
    core.put_item(Item={"pk": "KEY#abcd1234", "sk": "META", "secretHash": keys.sha256_hex(SECRET), "scopes": ["read:cohorts"], "label": "dashboard", **extra})


def call(auth, header):
    return auth.lambda_handler({"headers": {"x-api-key": header} if header is not None else {}}, None)


def test_valid_key_returns_scopes_and_records_last_use(tables):
    seed(tables["CORE_TABLE"])
    out = call(load_lambda("authorizer-apikey"), KEY)
    assert out == {"isAuthorized": True, "context": {"keyId": "abcd1234", "scopes": "read:cohorts"}}
    assert "lastUsedAt" in tables["CORE_TABLE"].get_item(Key={"pk": "KEY#abcd1234", "sk": "META"})["Item"]


def test_denies_wrong_secret_unknown_revoked_and_malformed_keys(tables):
    auth = load_lambda("authorizer-apikey")
    assert call(auth, KEY)["isAuthorized"] is False  # unknown key
    seed(tables["CORE_TABLE"])
    assert call(auth, "cic_abcd1234_wrong")["isAuthorized"] is False
    for bad in (None, "", "abcd1234_" + SECRET, "cic_abcd1234", "cic__x", "cic_a b_" + SECRET, "cic_ab_" + SECRET, "x" * 500):
        assert call(auth, bad)["isAuthorized"] is False
    seed(tables["CORE_TABLE"], revokedAt=123)
    assert call(auth, KEY)["isAuthorized"] is False


def test_fails_closed_on_database_errors(monkeypatch):
    monkeypatch.delenv("CORE_TABLE", raising=False)
    assert call(load_lambda("authorizer-apikey"), KEY) == {"isAuthorized": False}
