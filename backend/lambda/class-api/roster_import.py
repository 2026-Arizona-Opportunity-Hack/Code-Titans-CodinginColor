"""POST /v1/classes/{classId}/roster/import (?dryRun=true previews, writes nothing).

The CSV arrives as text in the JSON body. Only `displayName`, `externalId` and
`gradeLevel` (6 to 12, optional) are read. Every other column is ignored: never stored, never logged, and reported back
in `ignoredColumns` so the instructor can see what was dropped.
Row numbers count data rows from 1 (the header is not a row, blank lines are skipped).
"""
import csv
import io
import re

from cic import db, validate
from cic.authz import require_class_access
from cic.errors import InvalidCsv, ValidationError
from cic.http import Reply, Request
from cic.ids import new_id, utc_now_iso
from roster import (MAX_ROSTER, allocate_roster_numbers, class_id_from, grade_from, load_roster,
                    normalize_name, resolve_start_module)

MAX_NAME = 100
MAX_EXTERNAL_ID = 64
DUPLICATE_MODES = ("create", "skip")
_CONTROL = re.compile(r"[\x00-\x1f\x7f]")


def parse(text) -> tuple:
    """Return (rows, ignored_columns). rows is a list of (number, name, external_id)."""
    if not isinstance(text, str) or not text.strip():
        raise ValidationError("csv is required")
    try:
        table = [r for r in csv.reader(io.StringIO(text.lstrip("\ufeff"))) if any(c.strip() for c in r)]
    except csv.Error:
        raise InvalidCsv("The CSV could not be read")
    header = [h.strip() for h in (table[0] if table else [])]
    if "displayName" not in header:
        raise InvalidCsv("The CSV needs a displayName column")
    name_at = header.index("displayName")
    id_at = header.index("externalId") if "externalId" in header else None
    grade_at = header.index("gradeLevel") if "gradeLevel" in header else None
    ignored = [h for i, h in enumerate(header) if h and i not in (name_at, id_at, grade_at)]
    rows = []
    for n, cells in enumerate(table[1:], start=1):
        name = cells[name_at].strip() if name_at < len(cells) else ""
        ext = cells[id_at].strip() if id_at is not None and id_at < len(cells) else ""
        grade = cells[grade_at].strip() if grade_at is not None and grade_at < len(cells) else ""
        rows.append((n, re.sub(r"\s+", " ", name), ext, grade))
    return rows, ignored


def plan(rows, roster, duplicate_mode):
    by_ext = {i["externalId"]: i for i in roster if i.get("externalId")}
    by_name = {}
    for i in roster:
        if i["status"] == "active":
            by_name.setdefault(normalize_name(i["displayName"]), i)
    create, update, skipped, dups, errors, seen_ext = [], [], 0, [], [], set()
    for n, name, ext, grade_raw in rows:
        try:
            grade = grade_from(grade_raw)
        except ValidationError:
            errors.append({"row": n, "reason": "gradeLevel must be a grade from 6 to 12, or empty"})
            continue
        if not name:
            errors.append({"row": n, "reason": "displayName is empty"})
        elif len(name) > MAX_NAME or _CONTROL.search(name):
            errors.append({"row": n, "reason": f"displayName must be plain text up to {MAX_NAME} characters"})
        elif len(ext) > MAX_EXTERNAL_ID or _CONTROL.search(ext):
            errors.append({"row": n, "reason": f"externalId must be plain text up to {MAX_EXTERNAL_ID} characters"})
        elif ext and ext in seen_ext:
            errors.append({"row": n, "reason": "externalId appears more than once in the file"})
        else:
            if ext:
                seen_ext.add(ext)
            if ext in by_ext:
                update.append((by_ext[ext], name, grade))
                continue
            match = by_name.get(normalize_name(name))
            if match:
                if duplicate_mode == "skip":
                    skipped += 1
                    continue
                dups.append({"row": n, "displayName": name, "matchesStudentId": match["sk"].split("#", 1)[1]})
            create.append((name, ext, grade))
    if len(roster) + len(create) > MAX_ROSTER:
        raise InvalidCsv(f"A class can hold at most {MAX_ROSTER} students")
    return create, update, skipped, dups, errors


def import_roster(req: Request):
    class_id = class_id_from(req)
    table = db.get_table(db.CORE)
    require_class_access(req.auth, table, class_id)
    body = req.json()
    validate.reject_unknown(body, ("csv", "duplicateNames", "startModuleId"))
    mode = validate.choice(body, "duplicateNames", DUPLICATE_MODES) or "create"
    rows, ignored = parse(body.get("csv"))
    if len(rows) > MAX_ROSTER:
        raise InvalidCsv(f"At most {MAX_ROSTER} rows per import")
    start_module = resolve_start_module(table, class_id, body.get("startModuleId"))
    roster = load_roster(table, class_id)
    create, update, skipped, dups, errors = plan(rows, roster, mode)

    if req.query.get("dryRun") == "true":
        return {"toCreate": len(create), "toUpdate": len(update), "ignoredColumns": ignored,
                "possibleDuplicates": dups, "errors": errors}

    # Commit: rows with problems are skipped and reported, everything else is imported.
    first = allocate_roster_numbers(table, class_id, len(create)) if create else 0
    now = utc_now_iso()
    with table.batch_writer() as batch:
        for offset, (name, ext, grade) in enumerate(create):
            student_id = new_id()
            item = {"pk": f"CLS#{class_id}", "sk": f"STU#{student_id}", "displayName": name,
                    "rosterNumber": first + offset, "status": "active", "credVersion": 1, "createdAt": now}
            if ext:
                item["externalId"] = ext
            if start_module:
                item["startModuleId"] = start_module
            if grade:
                item["gradeLevel"] = grade
            batch.put_item(Item=item)
            batch.put_item(Item={"pk": f"STU#{student_id}", "sk": "META", "classId": class_id})
    updated = 0
    for item, name, grade in update:
        updated += 1
        changes = {"displayName": name} if item["displayName"] != name else {}
        if grade and item.get("gradeLevel") != grade:  # an empty cell leaves the stored grade alone
            changes["gradeLevel"] = grade
        if changes:
            table.update_item(Key={"pk": item["pk"], "sk": item["sk"]},
                              UpdateExpression="SET " + ", ".join(f"#{k} = :{k}" for k in changes),
                              ExpressionAttributeNames={f"#{k}": k for k in changes},
                              ExpressionAttributeValues={f":{k}": v for k, v in changes.items()})
    return Reply(data={"created": len(create), "updated": updated, "skipped": skipped,
                       "possibleDuplicates": dups, "errors": errors, "ignoredColumns": ignored,
                       "credentialsNeeded": len(create)})


ROUTES = {"POST /v1/classes/{classId}/roster/import": import_roster}
