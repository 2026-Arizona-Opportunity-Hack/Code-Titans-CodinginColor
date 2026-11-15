"""Classes and their instructors: docs/api.md section 4. Cognito JWT authorizer in front."""
from classes import ROUTES

from cic.http import make_handler

lambda_handler = make_handler(ROUTES)
