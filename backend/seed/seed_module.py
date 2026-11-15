"""Put a module from a JSON file into the deployed account, through the real curriculum handlers.

    AWS_PROFILE=hackathon AWS_REGION=us-west-2 python3 seed/seed_module.py seed/python-practice.json          # check only
    AWS_PROFILE=hackathon AWS_REGION=us-west-2 python3 seed/seed_module.py seed/python-practice.json --apply  # write

It runs the same save and publish code as the API, so the module passes the same checks. The work is recorded
in the audit log under the name "seed-script". Run it again to publish a new version of the same module.
Classes keep the version they were given until a teacher moves them (updateClasses is off).
"""
import importlib.util
import json
import os
import sys
from pathlib import Path

import boto3

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "lambda" / "shared-layer" / "python"), str(ROOT / "lambda"), str(ROOT / "lambda" / "curriculum-api")]
ACTOR = {"jwt": {"claims": {"sub": "seed-script", "cognito:groups": "[cic_admin]"}}}


def table_names() -> dict:
    names = boto3.client("dynamodb").get_paginator("list_tables").paginate().build_full_result()["TableNames"]
    out = {}
    for env, part in (("CONTENT_TABLE", "ContentTable"), ("CORE_TABLE", "CoreTable"), ("EVENTS_TABLE", "EventsTable"), ("PROGRESS_TABLE", "ProgressTable")):
        found = [n for n in names if part in n]
        if len(found) != 1:
            sys.exit(f"Expected one table with '{part}' in its name, found {found}")
        out[env] = found[0]
    return out


def call(handler, route, body=None, path=None, headers=None):
    event = {"routeKey": route, "headers": headers or {}, "pathParameters": path or {}, "body": json.dumps(body) if body is not None else None,
             "requestContext": {"requestId": "seed", "http": {"method": route.split()[0]}, "authorizer": ACTOR}}
    resp = handler.lambda_handler(event, None)
    return resp["statusCode"], json.loads(resp["body"])


def main() -> None:
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    apply = "--apply" in sys.argv
    if len(args) != 1:
        sys.exit(__doc__)
    doc = json.loads(Path(args[0]).read_text())
    import moduledoc  # noqa: E402 - needs the path set above
    problems = moduledoc.check_draft(doc, doc["moduleId"]) + moduledoc.publish_problems(doc)
    for p in problems:
        print("PROBLEM", p["path"], p["message"])
    if problems:
        sys.exit(1)
    print(f"'{doc['title']}' ({doc['moduleId']}) passes every check.")
    account = boto3.client("sts").get_caller_identity()["Account"]
    os.environ.update(table_names())
    print(f"Account {account}, content table {os.environ['CONTENT_TABLE']}")
    if not apply:
        print("Nothing written. Add --apply to write it.")
        return
    spec = importlib.util.spec_from_file_location("seed_curriculum", ROOT / "lambda" / "curriculum-api" / "index.py")
    handler = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(handler)
    module_id = doc["moduleId"]
    table = boto3.resource("dynamodb").Table(os.environ["CONTENT_TABLE"])
    meta = table.get_item(Key={"pk": f"MOD#{module_id}", "sk": "META"}).get("Item")
    if not meta:
        status, body = call(handler, "POST /v1/curriculum/modules", {"title": doc["title"]})
        if status != 201 or body["data"]["moduleId"] != module_id:
            sys.exit(f"Could not create the module: {status} {body}")
        revision = 1
    else:
        revision = int(meta["revision"])
        print(f"The module exists (version {int(meta['latestVersion'])}). Saving a new draft over it.")
    status, body = call(handler, "PUT /v1/curriculum/modules/{moduleId}/draft", doc, {"moduleId": module_id}, {"If-Match": str(revision)})
    if status != 200:
        sys.exit(f"Could not save the draft: {status} {json.dumps(body)[:800]}")
    status, body = call(handler, "POST /v1/curriculum/modules/{moduleId}/publish", {"updateClasses": False}, {"moduleId": module_id})
    if status != 201:
        sys.exit(f"Could not publish: {status} {json.dumps(body)[:800]}")
    print(f"Published version {body['data']['version']} of {module_id}.")


if __name__ == "__main__":
    main()
