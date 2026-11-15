"""Read API for CIC's org dashboard (api.md section 7). Key-authenticated, read-only.

Everything returned is aggregated. Groups with fewer than 5 students have their metrics
hidden (suppressed). No student names, IDs, codes, or free text appear in any response.
"""
from datetime import datetime, timedelta, timezone

from cic import classdata, db, keys, summaries
from cic.authz import api_key_from_auth
from cic.errors import NotFound, ValidationError
from cic.http import make_handler

SCOPE = "read:cohorts"
GROUPS = ("cohort", "class", "module", "org")


def _auth(req):
    api_key_from_auth(req.auth, SCOPE)


def _opt_id(req, name):
    value = req.query.get(name)
    return keys.safe_id(value, name) if value else None


def _date_ms(value, end_of_day=False):
    if not value:
        return None
    try:
        day = datetime.strptime(value, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    except ValueError:
        raise ValidationError("Dates must look like 2026-11-15")
    if end_of_day:
        day += timedelta(days=1) - timedelta(milliseconds=1)
    return int(day.timestamp() * 1000)


def cohorts(req):
    _auth(req)
    rows = []
    for meta in classdata.cohort_metas():
        cohort_id = meta["pk"][len("COH#"):]
        summary = summaries.cohort_summary(cohort_id, suppress=True)
        rows.append({"cohortId": cohort_id, "name": meta.get("name"), **{k: summary[k] for k in ("classes", "enrolled", "completion", "learningGain")}})
    return {"cohorts": sorted(rows, key=lambda r: r["name"] or ""), "definitions": summaries.DEFINITIONS}


def cohort_summary(req):
    _auth(req)
    cohort_id = keys.safe_id(req.path.get("cohortId"), "cohortId")
    if not classdata.classes_in_cohort(cohort_id):
        raise NotFound("Cohort not found")
    return {"generatedAt": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
            "cohort": {"cohortId": cohort_id, "name": classdata.name_of(keys.coh_pk(cohort_id))},
            **summaries.cohort_summary(cohort_id, suppress=True)}


def class_summary(req):
    _auth(req)
    class_id = keys.safe_id(req.path.get("classId"), "classId")
    classdata.require_cic_class(class_id)
    return summaries.class_summary(class_id, suppress=True)


def _scope(req):
    class_id = _opt_id(req, "classId")
    if class_id:
        classdata.require_cic_class(class_id)
    return summaries.scope_class_ids(class_id, _opt_id(req, "cohortId"), _opt_id(req, "orgId"))


def module_gain(req):
    _auth(req)
    return summaries.module_gain_pooled(_scope(req), keys.safe_id(req.path.get("moduleId"), "moduleId"))


def concept_gain(req):
    _auth(req)
    return {"concepts": summaries.concept_gain(_scope(req), suppress=True), "definitions": summaries.DEFINITIONS}


def progress(req):
    _auth(req)
    group_by = req.query.get("groupBy", "cohort")
    if group_by not in GROUPS:
        raise ValidationError("groupBy must be one of: " + ", ".join(GROUPS))
    start, end = _date_ms(req.query.get("from")), _date_ms(req.query.get("to"), end_of_day=True)
    groups = summaries.grouped_progress(_scope(req), group_by, start, end)
    return {"groupBy": group_by, "period": {"from": req.query.get("from"), "to": req.query.get("to")}, "groups": groups,
            "definitions": summaries.DEFINITIONS}


ROUTES = {
    "GET /v1/read/cohorts": cohorts,
    "GET /v1/read/cohorts/{cohortId}/summary": cohort_summary,
    "GET /v1/read/classes/{classId}/summary": class_summary,
    "GET /v1/read/modules/{moduleId}/gain": module_gain,
    "GET /v1/read/concepts/gain": concept_gain,
    "GET /v1/read/progress": progress,
}

lambda_handler = make_handler(ROUTES)
