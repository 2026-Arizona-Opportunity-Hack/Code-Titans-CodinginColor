import json

from health.index import lambda_handler


def test_health_returns_ok():
    event = {"routeKey": "GET /v1/health", "requestContext": {"requestId": "r", "http": {"method": "GET"}}}
    resp = lambda_handler(event, None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"]) == {"data": {"status": "ok"}}
