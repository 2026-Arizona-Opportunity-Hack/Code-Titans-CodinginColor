"""Shared pytest setup.

- Makes the shared layer importable as `cic`.
- `tables` fixture: the four DynamoDB tables in moto, with the same keys and GSIs as the CDK DataStack.
- `load_lambda(dir)`: import a Lambda's index.py (directory names are kebab-case, so they are not importable).
"""
import importlib.util
import os
import sys
from pathlib import Path

import boto3
import pytest

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "lambda" / "shared-layer" / "python"))
sys.path.insert(0, str(BACKEND / "lambda"))


def load_lambda(name: str):
    """Import backend/lambda/<name>/index.py as a uniquely named module."""
    folder = BACKEND / "lambda" / name
    if str(folder) not in sys.path:
        sys.path.insert(0, str(folder))
    spec = importlib.util.spec_from_file_location(f"lambda_{name.replace('-', '_')}_index", folder / "index.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _create(client, name, gsis):
    attrs = {"pk", "sk"} | {a for g in gsis for a in (f"{g}pk", f"{g}sk")}
    kwargs = {
        "TableName": name,
        "BillingMode": "PAY_PER_REQUEST",
        "KeySchema": [{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        "AttributeDefinitions": [{"AttributeName": a, "AttributeType": "S"} for a in sorted(attrs)],
    }
    if gsis:
        kwargs["GlobalSecondaryIndexes"] = [
            {
                "IndexName": g,
                "KeySchema": [{"AttributeName": f"{g}pk", "KeyType": "HASH"}, {"AttributeName": f"{g}sk", "KeyType": "RANGE"}],
                "Projection": {"ProjectionType": "ALL"},
            }
            for g in gsis
        ]
    client.create_table(**kwargs)


@pytest.fixture
def tables(monkeypatch):
    from moto import mock_aws

    for k, v in {"AWS_ACCESS_KEY_ID": "test", "AWS_SECRET_ACCESS_KEY": "test", "AWS_DEFAULT_REGION": "us-east-1"}.items():
        monkeypatch.setenv(k, v)
    names = {"CONTENT_TABLE": "content", "CORE_TABLE": "core", "PROGRESS_TABLE": "progress", "EVENTS_TABLE": "events"}
    for k, v in names.items():
        monkeypatch.setenv(k, v)
    with mock_aws():
        client = boto3.client("dynamodb")
        _create(client, "content", [])
        _create(client, "core", ["gsi1", "gsi2", "gsi3"])
        _create(client, "progress", ["gsi1", "gsi2"])
        _create(client, "events", [])
        from cic import classdata, db

        db._tables.clear()
        db._resource = None
        classdata._MODULE_CACHE.clear()  # published versions are cached in production; tests reuse ids
        yield {k: db.get_table(k) for k in names}
        db._tables.clear()
        db._resource = None
