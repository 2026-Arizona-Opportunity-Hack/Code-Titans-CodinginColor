"""Curriculum authoring and review: docs/api.md section 3. Cognito JWT authorizer in front."""
from assets import ROUTES as ASSET_ROUTES
from curriculum import ROUTES as CURRICULUM_ROUTES

from cic.http import make_handler

lambda_handler = make_handler({**CURRICULUM_ROUTES, **ASSET_ROUTES})
