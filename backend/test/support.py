"""Helpers for Lambda tests: load kebab-case Lambda dirs and build API events."""
import importlib.util
import json
from pathlib import Path

LAMBDA_DIR = Path(__file__).resolve().parents[1] / "lambda"


def load_lambda(name: str):
    spec = importlib.util.spec_from_file_location(
        f"lambda_{name.replace('-', '_')}", LAMBDA_DIR / name / "index.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def api_event(route_key, body=None, headers=None, auth=None):
    method, path = route_key.split(" ", 1)
    event = {"routeKey": route_key, "headers": headers or {},
             "requestContext": {"requestId": "req-1", "http": {"method": method, "path": path},
                                "authorizer": auth or {}}}
    if body is not None:
        event["body"] = body if isinstance(body, str) else json.dumps(body)
    return event
