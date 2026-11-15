"""Classes and their instructors: docs/api.md section 4. Cognito JWT authorizer in front."""
from classes import ROUTES as CLASS_ROUTES
from roster import ROUTES as ROSTER_ROUTES
from roster_import import ROUTES as IMPORT_ROUTES
from students import ROUTES as STUDENT_ROUTES

from cic.http import make_handler

lambda_handler = make_handler({**CLASS_ROUTES, **ROSTER_ROUTES, **IMPORT_ROUTES, **STUDENT_ROUTES})
