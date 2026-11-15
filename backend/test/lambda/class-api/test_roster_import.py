import json

import pytest
from support import api_event

ADMIN = ("[cic_admin]", "adm-1")
INS = ("[instructor]", "ins-1")
INS2 = ("[instructor]", "ins-2")
REV = ("[reviewer]", "rev-1")


def call(api, route, body=None, who=INS, path=None, query=None):
    auth = {"jwt": {"claims": {"sub": who[1], "cognito:groups": who[0]}}}
    resp = api.lambda_handler(api_event(route, body, auth=auth, path=path, query=query), None)
    return resp["statusCode"], json.loads(resp["body"])


def make_class(api, who=INS, **extra):
    return call(api, "POST /v1/classes", {"name": "P3", "orgId": "org_1", **extra}, who=who)[1]["data"]["classId"]


@pytest.fixture
def cls(api):
    return make_class(api)


def do_import(api, cls, csv, dry=False, who=INS, **extra):
    return call(api, "POST /v1/classes/{classId}/roster/import", {"csv": csv, **extra}, who=who,
                path={"classId": cls}, query={"dryRun": "true"} if dry else None)


def names(api, cls):
    resp = call(api, "GET /v1/classes/{classId}/roster", path={"classId": cls})
    return [s["displayName"] for s in resp[1]["data"]]


CSV = "displayName,externalId,dob\nAna R.,1042,2010-01-01\nBen T.,1043,2009-05-05\n"


def test_dry_run_reports_and_writes_nothing(api, cls):
    status, body = do_import(api, cls, CSV, dry=True)
    assert status == 200
    assert body["data"] == {"toCreate": 2, "toUpdate": 0, "ignoredColumns": ["dob"],
                            "possibleDuplicates": [], "errors": []}
    assert names(api, cls) == []


def test_commit_creates_students_without_credentials_and_drops_extra_columns(api, cls, table):
    status, body = do_import(api, cls, CSV)
    data = body["data"]
    assert status == 200 and data["created"] == 2 and data["credentialsNeeded"] == 2
    assert data["ignoredColumns"] == ["dob"]
    roster = call(api, "GET /v1/classes/{classId}/roster", path={"classId": cls})[1]["data"]
    assert [(s["displayName"], s["rosterNumber"], s["hasCredential"]) for s in roster] == [("Ana R.", 1, False), ("Ben T.", 2, False)]
    stored = json.dumps(table.scan()["Items"], default=str)
    assert "2010-01-01" not in stored and "dob" not in stored  # the birthdate never reaches the database


def test_students_without_credentials_cannot_log_in(api, cls, table):
    from cic.errors import InvalidCredentials
    from cic.identity import authenticate
    do_import(api, cls, CSV)
    code = table.get_item(Key={"pk": f"CLS#{cls}", "sk": "META"})["Item"]["joinCode"]
    with pytest.raises(InvalidCredentials):
        authenticate(code, "panda-tiger-river")


def test_reimport_matches_on_external_id_and_updates(api, cls):
    do_import(api, cls, CSV)
    status, body = do_import(api, cls, "displayName,externalId\nAna Rivera,1042\nCy S.,1044\n")
    assert body["data"]["created"] == 1 and body["data"]["updated"] == 1
    assert sorted(names(api, cls)) == ["Ana Rivera", "Ben T.", "Cy S."]


def test_repeated_name_is_flagged_by_default_and_skippable(api, cls):
    first = call(api, "POST /v1/classes/{classId}/roster", {"displayName": "Alex Kim"}, path={"classId": cls})[1]["data"]
    csv = "displayName\nalex  kim\nNew Kid\n"
    _, dry = do_import(api, cls, csv, dry=True)
    assert dry["data"]["possibleDuplicates"] == [{"row": 1, "displayName": "alex kim", "matchesStudentId": first["studentId"]}]
    assert dry["data"]["toCreate"] == 2
    _, skip = do_import(api, cls, csv, duplicateNames="skip")
    assert skip["data"]["created"] == 1 and skip["data"]["skipped"] == 1
    assert sorted(names(api, cls)) == ["Alex Kim", "New Kid"]


def test_bad_rows_are_reported_and_skipped_on_commit(api, cls):
    csv = "displayName,externalId\n,1\nGood One,2\nDup Id,2\n" + "x" * 101 + ",3\n"
    _, dry = do_import(api, cls, csv, dry=True)
    assert [e["row"] for e in dry["data"]["errors"]] == [1, 3, 4]
    status, body = do_import(api, cls, csv)
    assert status == 200 and body["data"]["created"] == 1 and len(body["data"]["errors"]) == 3
    assert names(api, cls) == ["Good One"]


def test_start_module_applies_to_new_students(api, cls):
    do_import(api, cls, "displayName\nA\n", startModuleId="py-loops")
    roster = call(api, "GET /v1/classes/{classId}/roster", path={"classId": cls})[1]["data"]
    assert roster[0]["startModuleId"] == "py-loops"
    assert do_import(api, cls, "displayName\nB\n", startModuleId="nope")[0] == 400


@pytest.mark.parametrize("csv", ["", "   ", "name,id\nAna,1\n", "externalId\n1\n"])
def test_missing_or_headerless_csv(api, cls, csv):
    status, body = do_import(api, cls, csv)
    assert status == 400 and body["code"] in ("VALIDATION_ERROR", "INVALID_CSV")


def test_bom_blank_lines_and_quoted_names(api, cls):
    csv = '\ufeffdisplayName,externalId\n\n"Lee, Jo",7\n   \n'
    assert do_import(api, cls, csv)[1]["data"]["created"] == 1
    assert names(api, cls) == ["Lee, Jo"]


def test_row_and_roster_limits(api, cls):
    big = "displayName\n" + "\n".join(f"S{i}" for i in range(501))
    assert do_import(api, cls, big)[1]["code"] == "INVALID_CSV"
    assert do_import(api, cls, "displayName\n" + "\n".join(f"S{i}" for i in range(500)))[0] == 200
    assert do_import(api, cls, "displayName\nOne more\n")[1]["code"] == "INVALID_CSV"


def test_import_needs_class_access(api, cls):
    for who in (INS2, REV):
        assert do_import(api, cls, CSV, who=who)[0] == 403
    assert do_import(api, cls, CSV, who=ADMIN)[0] == 200
    assert call(api, "POST /v1/classes/{classId}/roster/import", {"csv": CSV, "extra": 1}, path={"classId": cls})[0] == 400


def search(api, who=INS, **query):
    return call(api, "GET /v1/students", who=who, query=query or None)


def test_search_across_the_callers_classes_only(api):
    a = make_class(api, who=INS)
    b = make_class(api, who=INS2, cohortId="coh_1")
    do_import(api, a, "displayName\nAna R.\nBen T.\n")
    do_import(api, b, "displayName\nAna Lopez\n", who=INS2)
    mine = search(api, q="ana")[1]["data"]
    assert [(s["displayName"], s["classId"]) for s in mine] == [("Ana R.", a)]
    assert {"studentId", "displayName", "rosterNumber", "classId"} <= set(mine[0])
    assert len(search(api, who=ADMIN, q="ana")[1]["data"]) == 2
    assert [s["classId"] for s in search(api, who=ADMIN, q="ana", cohortId="coh_1")[1]["data"]] == [b]
    assert [s["classId"] for s in search(api, who=ADMIN, classId=a)[1]["data"]] == [a, a]


def test_search_limits_and_access(api, cls):
    do_import(api, cls, "displayName\nA\nB\nC\n")
    body = search(api, limit="2")[1]
    assert len(body["data"]) == 2 and body["meta"]["truncated"] is True
    assert search(api, who=INS2, classId=cls)[0] == 403
    assert search(api, who=REV)[0] == 403
    assert search(api, limit="0")[0] == 400
    assert search(api, classId="a#b")[0] == 400


def test_search_results_name_the_school_and_admins_can_filter_by_it(api, table):
    table.put_item(Item={"pk": "ORG#org_1", "sk": "META", "status": "active", "name": "Maryvale High"})
    table.put_item(Item={"pk": "ORG#org_2", "sk": "META", "status": "active", "name": "Desert Edge High"})
    a = make_class(api, who=ADMIN, orgId="org_1")
    b = make_class(api, who=ADMIN, orgId="org_2")
    do_import(api, a, "displayName\nAna\n", who=ADMIN)
    do_import(api, b, "displayName\nBen\n", who=ADMIN)
    rows = {s["displayName"]: s for s in search(api, who=ADMIN)[1]["data"]}
    assert (rows["Ana"]["schoolName"], rows["Ben"]["schoolName"]) == ("Maryvale High", "Desert Edge High")
    assert rows["Ana"]["orgId"] == "org_1"
    assert [s["displayName"] for s in search(api, who=ADMIN, orgId="org_2")[1]["data"]] == ["Ben"]
    assert search(api, who=ADMIN, orgId="a#b")[0] == 400
