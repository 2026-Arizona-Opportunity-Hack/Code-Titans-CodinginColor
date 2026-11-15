import os

import boto3
import pytest
from support import load_lambda


@pytest.fixture
def api(table):
    ddb = boto3.resource("dynamodb")
    content = ddb.create_table(
        TableName="content", BillingMode="PAY_PER_REQUEST",
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}, {"AttributeName": "sk", "AttributeType": "S"}])
    content.put_item(Item={"pk": "MOD#py-loops", "sk": "META"})
    ddb.create_table(
        TableName="progress", BillingMode="PAY_PER_REQUEST",
        KeySchema=[{"AttributeName": "pk", "KeyType": "HASH"}, {"AttributeName": "sk", "KeyType": "RANGE"}],
        AttributeDefinitions=[{"AttributeName": "pk", "AttributeType": "S"}, {"AttributeName": "sk", "AttributeType": "S"}])
    os.environ["PROGRESS_TABLE"] = "progress"
    os.environ["CONTENT_TABLE"] = "content"
    table.put_item(Item={"pk": "ORG#org_1", "sk": "META", "status": "active"})
    table.put_item(Item={"pk": "ORG#org_old", "sk": "META", "status": "archived"})
    table.put_item(Item={"pk": "COH#coh_1", "sk": "META"})
    module = load_lambda("class-api")
    import classes
    classes._cognito = None
    return module
