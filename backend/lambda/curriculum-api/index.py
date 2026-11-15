"""Curriculum authoring and review: docs/api.md section 3. Cognito JWT authorizer in front."""
from curriculum import ROUTES

from cic.http import make_handler

lambda_handler = make_handler(ROUTES)
