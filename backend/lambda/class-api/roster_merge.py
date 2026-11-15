"""POST /v1/classes/{classId}/roster/{studentId}/merge  body {intoStudentId}

Folds a duplicate student (the path's studentId) into the student who is kept
(intoStudentId), then removes the duplicate. Both must be in this class.

Per item in the progress table:
  ACT#  activity: the better result wins. complete beats in_progress, bestScore is the
        higher one, attempts, activeSeconds and hintCount add up, the earliest start and
        completion are kept, and the kept student's worksheet draft wins if they have one.
  MOD#  module state: recomputed from the merged activities against the pinned version.
  ASM#  pretest or post-test: the earlier submission is kept. Assessments are taken once,
        and keeping a later or higher score would inflate learning gain.
  SUB#  worksheet submissions: all are kept, as history.
Unlock overrides move to the kept student. The kept student's name, login words,
start module and status stay as they are; their externalId is filled from the
duplicate only if they have none.

Each source item is written to the kept student and deleted from the duplicate in one
transaction, so a merge that fails halfway can simply be run again.
"""
from boto3.dynamodb.conditions import Key

from cic import audit, db, progress, validate
from cic.authz import require_class_access
from cic.classdata import get_module_doc
from cic.errors import NotFound, ValidationError
from cic.http import Request
from roster import class_id_from, student_id_from

COUNTERS = ("attempts", "activeSeconds", "hintCount")
STATUS_RANK = {None: 0, "in_progress": 1, "complete": 2}


def _min(a, b):
    present = [v for v in (a, b) if v is not None]
    return min(present) if present else None


def _max(a, b):
    present = [v for v in (a, b) if v is not None]
    return max(present) if present else None


def merge_activity(keep: dict, dup: dict) -> dict:
    """Combine two ACT# items for the same activity. `keep` keeps its keys and identity."""
    out = {**dup, **keep}
    for field in COUNTERS:
        total = (keep.get(field) or 0) + (dup.get(field) or 0)
        if total or field in keep or field in dup:
            out[field] = total
    out["status"] = max(keep.get("status"), dup.get("status"), key=lambda s: STATUS_RANK.get(s, 0))
    for field, pick in (("bestScore", _max), ("startedAt", _min), ("completedAt", _min), ("lastActiveAt", _max)):
        value = pick(keep.get(field), dup.get(field))
        if value is not None:
            out[field] = value
    if out["status"] != "complete":
        out.pop("completedAt", None)
    if not keep.get("draft") and dup.get("draft"):
        out["draft"] = dup["draft"]
    return out


def _move(table, old: dict, new: dict) -> None:
    table.meta.client.transact_write_items(TransactItems=[
        {"Put": {"TableName": table.name, "Item": new}},
        {"Delete": {"TableName": table.name, "Key": {"pk": old["pk"], "sk": old["sk"]}}},
    ])


def merge(req: Request):
    class_id, dup_id = class_id_from(req), student_id_from(req)
    core = db.get_table(db.CORE)
    staff = require_class_access(req.auth, core, class_id)
    body = req.json()
    validate.reject_unknown(body, ("intoStudentId",))
    keep_id = validate.safe_id(body.get("intoStudentId"), "intoStudentId")
    if keep_id == dup_id:
        raise ValidationError("A student cannot be merged into themselves")
    roster = {sid: core.get_item(Key={"pk": f"CLS#{class_id}", "sk": f"STU#{sid}"}).get("Item")
              for sid in (dup_id, keep_id)}
    if not roster[dup_id]:
        raise NotFound("Student not found")
    if not roster[keep_id]:
        raise ValidationError("intoStudentId is not a student in this class")

    prog = db.get_table(db.PROGRESS)
    keep_pk, dup_pk = f"STU#{keep_id}", f"STU#{dup_id}"
    kept = {i["sk"]: i for i in db.query_all(prog, KeyConditionExpression=Key("pk").eq(keep_pk))}
    counts = {"activities": 0, "modules": 0, "assessments": 0, "submissions": 0, "overrides": 0}
    touched_modules = set()

    for item in list(db.query_all(prog, KeyConditionExpression=Key("pk").eq(dup_pk))):
        sk, kind = item["sk"], item["sk"].split("#", 1)[0]
        if kind == "ACT":
            target = merge_activity(kept[sk], item) if sk in kept else {**item, "pk": keep_pk}
            _move(prog, item, target)
            kept[sk] = target
            touched_modules.add(sk.split("#")[1])
            counts["activities"] += 1
        elif kind == "ASM":
            if sk in kept and int(kept[sk]["submittedAt"]) <= int(item["submittedAt"]):
                prog.delete_item(Key={"pk": dup_pk, "sk": sk})  # the kept student's earlier answer stands
            else:
                target = {**item, "pk": keep_pk, "gsi1sk": f"{item['role']}#{keep_id}"}
                _move(prog, item, target)
                kept[sk] = target
            counts["assessments"] += 1
        elif kind == "SUB":
            new_sk, ts = sk, int(item["submittedAt"])
            while new_sk in kept:  # two submissions in the same millisecond: shift by 1 ms
                ts += 1
                new_sk = f"SUB#{item['activityId']}#{ts:013d}"
            target = {**item, "pk": keep_pk, "sk": new_sk}
            if "gsi2pk" in item:
                target["gsi2sk"] = f"{ts:013d}#{keep_id}"
            _move(prog, item, target)
            kept[new_sk] = target
            counts["submissions"] += 1
        elif kind == "MOD":
            touched_modules.add(sk.split("#", 1)[1])
            target = {**kept.get(sk, {}), **{k: v for k, v in item.items() if k not in kept.get(sk, {})},
                      "pk": keep_pk, "gsi1sk": keep_pk}
            if sk in kept:
                target["startedAt"] = _min(kept[sk].get("startedAt"), item.get("startedAt"))
                target["lastActiveAt"] = _max(kept[sk].get("lastActiveAt"), item.get("lastActiveAt"))
            _move(prog, item, target)
            kept[sk] = target
            counts["modules"] += 1
        else:  # anything unknown is kept, not lost
            _move(prog, item, {**item, "pk": keep_pk})

    _recompute_modules(prog, class_id, keep_pk, kept, touched_modules)

    for ovr in list(db.query_all(core, KeyConditionExpression=(
            Key("pk").eq(f"CLS#{class_id}") & Key("sk").begins_with(f"OVR#{dup_id}#")))):
        _move(core, ovr, {**ovr, "sk": f"OVR#{keep_id}#{ovr['moduleId']}", "studentId": keep_id})
        counts["overrides"] += 1

    keep_roster, dup_roster = roster[keep_id], roster[dup_id]
    if not keep_roster.get("externalId") and dup_roster.get("externalId"):
        core.update_item(Key={"pk": keep_roster["pk"], "sk": keep_roster["sk"]},
                         UpdateExpression="SET externalId = :e", ExpressionAttributeValues={":e": dup_roster["externalId"]})
    core.meta.client.transact_write_items(TransactItems=[  # last, so a retry still finds the duplicate
        {"Delete": {"TableName": core.name, "Key": {"pk": f"CLS#{class_id}", "sk": f"STU#{dup_id}"}}},
        {"Delete": {"TableName": core.name, "Key": {"pk": f"STU#{dup_id}", "sk": "META"}}},
    ])
    audit.record(staff.user_id, "roster_merge", {"classId": class_id, "fromStudentId": dup_id, "intoStudentId": keep_id})
    return {"intoStudentId": keep_id, "removedStudentId": dup_id, "merged": counts}


def _recompute_modules(prog, class_id: str, keep_pk: str, kept: dict, module_ids: set) -> None:
    """A module can become complete when the two students did different activities."""
    core = db.get_table(db.CORE)
    pinned = {a["moduleId"]: int(a["moduleVersion"]) for a in db.query_all(core, KeyConditionExpression=(
        Key("pk").eq(f"CLS#{class_id}") & Key("sk").begins_with("ASG#")))}
    for module_id in module_ids:
        mod_sk = f"MOD#{module_id}"
        if module_id not in pinned or mod_sk not in kept:
            continue
        statuses = {(module_id, sk.split("#", 2)[2]): i.get("status")
                    for sk, i in kept.items() if sk.startswith(f"ACT#{module_id}#")}
        complete = progress.is_module_complete(get_module_doc(module_id, pinned[module_id]), statuses)
        item = dict(kept[mod_sk])
        item["state"] = "complete" if complete else "in_progress"
        if complete:
            done = [i.get("completedAt") for sk, i in kept.items() if sk.startswith(f"ACT#{module_id}#")]
            item["completedAt"] = item.get("completedAt") or max(d for d in done if d is not None)
        else:
            item.pop("completedAt", None)
        prog.put_item(Item=item)


ROUTES = {"POST /v1/classes/{classId}/roster/{studentId}/merge": merge}
