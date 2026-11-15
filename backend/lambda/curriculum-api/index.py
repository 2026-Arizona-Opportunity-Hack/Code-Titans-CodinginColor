"""Curriculum authoring and review: docs/api.md section 3. Cognito JWT authorizer in front."""
from assets import ROUTES as ASSET_ROUTES
from converter import ROUTES as CONVERT_ROUTES, run_job
from curriculum import ROUTES as CURRICULUM_ROUTES

from cic.http import make_handler

_http = make_handler({**CURRICULUM_ROUTES, **ASSET_ROUTES, **CONVERT_ROUTES})


def lambda_handler(event, context):
    # The converter invokes this function asynchronously with {"convertJob": id} for the slow AI work.
    if isinstance(event, dict) and "convertJob" in event and "routeKey" not in event:
        run_job(str(event["convertJob"]))
        return {"ok": True}
    return _http(event, context)
