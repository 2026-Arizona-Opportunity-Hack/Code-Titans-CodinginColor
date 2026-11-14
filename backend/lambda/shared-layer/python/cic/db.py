"""DynamoDB access shared by Lambdas.

Table names come from environment variables set by CDK. boto3 resources are
created at module level (reused across warm invocations) via get_table.
"""
import os
from decimal import Decimal
from typing import Any, Dict, Iterator

import boto3

_resource = None
_tables: Dict[str, Any] = {}

CONTENT = "CONTENT_TABLE"
CORE = "CORE_TABLE"
PROGRESS = "PROGRESS_TABLE"
EVENTS = "EVENTS_TABLE"


def get_table(env_name: str) -> Any:
    """Return the boto3 Table for an env var like CORE_TABLE. Fails fast if it is unset."""
    global _resource
    name = os.environ.get(env_name)
    if not name:
        raise ValueError(f"{env_name} not set")
    if name not in _tables:
        if _resource is None:
            _resource = boto3.resource("dynamodb")
        _tables[name] = _resource.Table(name)
    return _tables[name]


def query_all(table: Any, **kwargs: Any) -> Iterator[dict]:
    """Yield every item from a query, following pagination."""
    while True:
        resp = table.query(**kwargs)
        yield from resp.get("Items", [])
        last = resp.get("LastEvaluatedKey")
        if not last:
            return
        kwargs["ExclusiveStartKey"] = last


def to_dynamo(value: Any) -> Any:
    """Convert floats to Decimal (DynamoDB rejects floats) and drop None values from dicts."""
    if isinstance(value, float):
        return Decimal(str(value))
    if isinstance(value, dict):
        return {k: to_dynamo(v) for k, v in value.items() if v is not None}
    if isinstance(value, (list, tuple)):
        return [to_dynamo(v) for v in value]
    return value
