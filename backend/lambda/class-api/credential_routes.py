"""Login words and join codes for a class.

POST /v1/classes/{classId}/credentials          issue or reset students' secret words
POST /v1/classes/{classId}/join-code/rotate     issue a new class code
"""
import os

from botocore.exceptions import ClientError

from cic import credentials, db, validate
from cic.authz import require_class_access
from cic.errors import Conflict, ValidationError
from cic.http import Reply, Request
from classes import new_join_code
from roster import MAX_ROSTER, class_id_from, load_roster


def issue_credentials(req: Request):
    class_id = class_id_from(req)
    table = db.get_table(db.CORE)
    require_class_access(req.auth, table, class_id)
    body = req.json() if req.raw_body else {}
    validate.reject_unknown(body, ("studentIds",))
    wanted = validate.string_list(body, "studentIds", MAX_ROSTER)

    roster = load_roster(table, class_id)
    by_id = {i["sk"].split("#", 1)[1]: i for i in roster}
    if wanted is None:
        targets = [i for i in roster if i["status"] == "active"]  # everyone who can sign in
    else:
        unknown = [s for s in wanted if s not in by_id]
        if unknown:
            raise ValidationError("studentIds contains a student who is not in this class")
        targets = [by_id[s] for s in wanted]
        if any(t["status"] != "active" for t in targets):
            raise ValidationError("Inactive students cannot be given login words")

    taken = {i.get("credHmac", "") for i in roster}
    meta = table.get_item(Key={"pk": f"CLS#{class_id}", "sk": "META"})["Item"]
    sheet = []
    for item in sorted(targets, key=lambda i: int(i["rosterNumber"])):
        words, digest = credentials.issue(class_id, taken)
        taken.add(digest)
        # A new credVersion ends the student's live sessions (the authorizer re-checks it).
        table.update_item(
            Key={"pk": item["pk"], "sk": item["sk"]}, ConditionExpression="attribute_exists(pk)",
            UpdateExpression="SET credHmac = :h ADD credVersion :one",
            ExpressionAttributeValues={":h": digest, ":one": 1})
        sheet.append({"studentId": item["sk"].split("#", 1)[1], "displayName": item["displayName"],
                      "rosterNumber": int(item["rosterNumber"]), "studentCode": words})
    return Reply(data={"classCode": meta["joinCode"], "loginUrlBase": f"{os.environ.get('APP_URL', '').rstrip('/')}/s",
                       "students": sheet})


def rotate_join_code(req: Request):
    class_id = class_id_from(req)
    table = db.get_table(db.CORE)
    require_class_access(req.auth, table, class_id)
    old = table.get_item(Key={"pk": f"CLS#{class_id}", "sk": "META"})["Item"]["joinCode"]
    for _ in range(5):
        code = new_join_code()
        try:
            table.meta.client.transact_write_items(TransactItems=[
                {"Put": {"TableName": table.name, "Item": {"pk": f"JOIN#{code}", "sk": "META", "classId": class_id},
                         "ConditionExpression": "attribute_not_exists(pk)"}},
                {"Delete": {"TableName": table.name, "Key": {"pk": f"JOIN#{old}", "sk": "META"}}},
                {"Update": {"TableName": table.name, "Key": {"pk": f"CLS#{class_id}", "sk": "META"},
                            "UpdateExpression": "SET joinCode = :c, gsi3pk = :p",
                            "ExpressionAttributeValues": {":c": code, ":p": f"JOIN#{code}"}}},
            ])
            return {"classId": class_id, "joinCode": code}
        except ClientError as err:
            if err.response["Error"]["Code"] != "TransactionCanceledException":
                raise
    raise Conflict("Could not allocate a class code. Try again")


ROUTES = {
    "POST /v1/classes/{classId}/credentials": issue_credentials,
    "POST /v1/classes/{classId}/join-code/rotate": rotate_join_code,
}
