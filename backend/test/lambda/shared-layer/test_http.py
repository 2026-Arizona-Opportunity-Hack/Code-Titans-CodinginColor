import json
from decimal import Decimal

from cic.errors import Forbidden, ValidationError
from cic.http import Reply, make_handler


def event(route_key="GET /v1/x", body=None, origin=None, method=None):
    headers = {"Origin": origin} if origin else {}
    return {
        "routeKey": route_key,
        "headers": headers,
        "body": body,
        "pathParameters": {"classId": "c1"},
        "queryStringParameters": {"q": "a"},
        "requestContext": {"requestId": "req-1", "http": {"method": method or route_key.split(" ")[0]}},
    }


def test_wraps_data_in_envelope_and_converts_decimals(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000")
    handler = make_handler({"GET /v1/x": lambda req: {"n": Decimal("3"), "avg": Decimal("2.5")}})
    resp = handler(event(origin="http://localhost:3000"), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"]) == {"data": {"n": 3, "avg": 2.5}}
    assert resp["headers"]["Access-Control-Allow-Origin"] == "http://localhost:3000"


def test_cors_origin_is_not_reflected_when_not_allowed(monkeypatch):
    monkeypatch.setenv("ALLOWED_ORIGINS", "http://localhost:3000")
    handler = make_handler({"GET /v1/x": lambda req: {}})
    resp = handler(event(origin="https://evil.example"), None)
    assert "Access-Control-Allow-Origin" not in resp["headers"]


def test_api_errors_keep_status_code_and_request_id():
    def boom(req):
        raise Forbidden("nope")

    resp = make_handler({"GET /v1/x": boom})(event(), None)
    body = json.loads(resp["body"])
    assert resp["statusCode"] == 403
    assert body == {"error": "nope", "code": "FORBIDDEN", "requestId": "req-1"}
    assert "Access-Control-Allow-Headers" in resp["headers"]  # CORS on errors too


def test_unexpected_errors_return_generic_message_without_details():
    def boom(req):
        raise RuntimeError("secret table name leaked")

    resp = make_handler({"GET /v1/x": boom})(event(), None)
    assert resp["statusCode"] == 500
    assert "secret" not in resp["body"]
    assert json.loads(resp["body"])["code"] == "INTERNAL_ERROR"


def test_unknown_route_is_404_and_options_is_204():
    handler = make_handler({})
    assert handler(event("GET /v1/missing"), None)["statusCode"] == 404
    assert handler(event("GET /v1/missing", method="OPTIONS"), None)["statusCode"] == 204


def test_reply_controls_status_headers_and_meta():
    handler = make_handler({"POST /v1/x": lambda req: Reply({"id": 1}, status=201, meta={"nextCursor": None}, headers={"X-A": "1"})})
    resp = handler(event("POST /v1/x"), None)
    assert resp["statusCode"] == 201
    assert resp["headers"]["X-A"] == "1"
    assert json.loads(resp["body"])["meta"] == {"nextCursor": None}


def test_request_json_validates_shape_and_size():
    seen = {}

    def read(req):
        seen["body"] = req.json()
        return {}

    handler = make_handler({"POST /v1/x": read})
    assert handler(event("POST /v1/x", body='{"a": 1}'), None)["statusCode"] == 200
    assert seen["body"] == {"a": 1}
    for bad in (None, "not json", "[1]"):
        assert handler(event("POST /v1/x", body=bad), None)["statusCode"] == 400
    too_big = json.dumps({"x": "a" * 300_000})
    assert handler(event("POST /v1/x", body=too_big), None)["statusCode"] == 400


def test_validation_error_default_code():
    assert ValidationError("x").code == "VALIDATION_ERROR"
