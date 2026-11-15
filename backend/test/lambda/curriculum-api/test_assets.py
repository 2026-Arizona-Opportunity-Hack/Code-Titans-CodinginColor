import json
import os

import pytest
from support import api_event

ADMIN = ("[cic_admin]", "adm-1")
AUTHOR = ("[instructor]", "ins-author")
INS = ("[instructor]", "ins-plain")
REV = ("[reviewer]", "rev-1")
ROUTE = "POST /v1/curriculum/assets/upload-url"


@pytest.fixture(autouse=True)
def setup(api, table, monkeypatch):
    import assets
    assets._s3 = None
    monkeypatch.setenv("AWS_REGION", "us-west-2")
    table.put_item(Item={"pk": "USR#ins-author", "sk": "META", "canAuthor": True})
    os.environ.update(ASSETS_BUCKET="assets-bucket", ASSETS_URL="https://cdn.example.org/")


def call(api, body, who=ADMIN):
    auth = {"jwt": {"claims": {"sub": who[1], "cognito:groups": who[0]}}}
    resp = api.lambda_handler(api_event(ROUTE, body, auth=auth), None)
    return resp["statusCode"], json.loads(resp["body"])


def test_returns_a_signed_form_for_one_image_under_the_curriculum_prefix(api):
    status, body = call(api, {"contentType": "image/png", "size": 1000})
    data = body["data"]
    assert status == 200
    assert data["key"].startswith("curriculum/") and data["key"].endswith(".png")
    assert data["assetUrl"] == f"https://cdn.example.org/{data['key']}"
    assert data["uploadUrl"] == "https://assets-bucket.s3.us-west-2.amazonaws.com/"  # regional, never the global endpoint
    assert data["fields"]["Content-Type"] == "image/png" and data["fields"]["key"] == data["key"]
    assert "policy" in data["fields"] and "x-amz-signature" in data["fields"]  # S3 verifies this form


def test_the_signed_policy_pins_type_and_size(api):
    import base64
    data = call(api, {"contentType": "image/webp", "size": 2048})[1]["data"]
    policy = json.loads(base64.b64decode(data["fields"]["policy"]))
    assert {"Content-Type": "image/webp"} in policy["conditions"]
    assert ["content-length-range", 1, 2048] in policy["conditions"]
    assert {"key": data["key"]} in policy["conditions"] or ["eq", "$key", data["key"]] in policy["conditions"]


def test_each_call_gets_a_new_key(api):
    keys = {call(api, {"contentType": "image/jpeg", "size": 10})[1]["data"]["key"] for _ in range(3)}
    assert len(keys) == 3 and all(k.endswith(".jpg") for k in keys)


@pytest.mark.parametrize("body", [
    {"contentType": "image/svg+xml", "size": 10}, {"contentType": "image/gif", "size": 10},
    {"contentType": "text/html", "size": 10}, {"size": 10}, {"contentType": "image/png"},
    {"contentType": "image/png", "size": 0}, {"contentType": "image/png", "size": 5 * 1024 * 1024 + 1},
    {"contentType": "image/png", "size": "10"}, {"contentType": "image/png", "size": True},
    {"contentType": "image/png", "size": 10, "key": "../x"}])
def test_validation(api, body):
    assert call(api, body)[0] == 400


def test_the_largest_allowed_size_is_accepted(api):
    assert call(api, {"contentType": "image/png", "size": 5 * 1024 * 1024})[0] == 200


def test_only_authors_can_ask_for_upload_urls(api):
    ok = {"contentType": "image/png", "size": 10}
    assert call(api, ok, who=AUTHOR)[0] == 200
    for who in (INS, REV):
        assert call(api, ok, who=who)[0] == 403
