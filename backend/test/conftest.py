"""Make the shared layer importable as `cic` when running pytest from backend/."""
import sys
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND / "lambda" / "shared-layer" / "python"))
sys.path.insert(0, str(BACKEND / "lambda"))


# ---- DynamoDB (moto) fixtures for tests that touch the core table ----
import os

import pytest

os.environ.setdefault("AWS_ACCESS_KEY_ID", "test")
os.environ.setdefault("AWS_SECRET_ACCESS_KEY", "test")
os.environ.setdefault("AWS_DEFAULT_REGION", "us-west-2")
os.environ.setdefault("CORE_TABLE", "core")
os.environ.setdefault("CREDENTIAL_PEPPER", "test-pepper")
os.environ.setdefault("ALLOWED_ORIGINS", "http://localhost:3000")


@pytest.fixture
def table():
    import boto3
    from moto import mock_aws

    from cic import db

    with mock_aws():
        db._resource = None
        db._tables.clear()
        attrs = ("pk", "sk", "gsi1pk", "gsi1sk", "gsi2pk", "gsi2sk", "gsi3pk", "gsi3sk")
        gsi = lambda n: {"IndexName": n, "Projection": {"ProjectionType": "ALL"}, "KeySchema": [
            {"AttributeName": f"{n}pk", "KeyType": "HASH"}, {"AttributeName": f"{n}sk", "KeyType": "RANGE"}]}
        t = boto3.resource("dynamodb").create_table(
            TableName="core", BillingMode="PAY_PER_REQUEST",
            KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
            AttributeDefinitions=[{"AttributeName": a, "AttributeType": "S"} for a in attrs],
            GlobalSecondaryIndexes=[gsi("gsi1"), gsi("gsi2"), gsi("gsi3")])
        yield t


@pytest.fixture
def seeded(table):
    """One class (code K7M4QX) with two active students. Returns their words."""
    from cic.identity import credential_hmac

    table.put_item(Item={"pk": "CLS#cls_01", "sk": "META", "status": "active",
                         "gsi3pk": "JOIN#K7M4QX", "gsi3sk": "CLS#cls_01"})
    words = {"stu_01": "panda-tiger-river", "stu_02": "lemon-army-dizzy"}
    for sid, name in (("stu_01", "Ana R."), ("stu_02", "Ben T.")):
        table.put_item(Item={"pk": "CLS#cls_01", "sk": f"STU#{sid}", "displayName": name,
                             "status": "active", "credVersion": 1,
                             "credHmac": credential_hmac("cls_01", words[sid])})
    return words
