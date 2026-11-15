import json
from decimal import Decimal

from cic.db import to_dynamo
from cic.http import Reply, make_handler
from cic.ids import to_ms


def test_to_ms_reads_iso_strings_seconds_and_milliseconds():
    assert to_ms("1970-01-01T00:00:01Z") == 1000
    assert to_ms("2026-11-15T01:23:40Z") == to_ms("2026-11-15T01:23:40+00:00")
    assert to_ms(1_700_000_000) == 1_700_000_000_000          # seconds
    assert to_ms(Decimal("1700000000000")) == 1_700_000_000_000  # milliseconds
    assert to_ms(None) == 0 and to_ms("") == 0 and to_ms("yesterday") == 0 and to_ms(object()) == 0


def test_to_dynamo_turns_floats_into_decimals_and_drops_none():
    out = to_dynamo({"a": 1.5, "b": None, "c": [2.5, {"d": None, "e": 3}]})
    assert out == {"a": Decimal("1.5"), "c": [Decimal("2.5"), {"e": 3}]}


def test_raw_replies_skip_the_json_envelope():
    handler = make_handler({"GET /v1/x": lambda req: Reply(raw="a,b\r\n", content_type="text/csv", headers={"X-A": "1"})})
    event = {"routeKey": "GET /v1/x", "headers": {}, "requestContext": {"requestId": "r", "http": {"method": "GET"}}}
    resp = handler(event, None)
    assert resp["body"] == "a,b\r\n" and resp["headers"]["Content-Type"] == "text/csv" and resp["headers"]["X-A"] == "1"
    assert "Access-Control-Allow-Headers" in resp["headers"]
    assert json.loads(make_handler({"GET /v1/x": lambda r: {"k": 1}})(event, None)["body"]) == {"data": {"k": 1}}
