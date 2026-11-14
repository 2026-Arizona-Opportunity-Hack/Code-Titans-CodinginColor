"""GET /v1/health: liveness check with no auth and no data access."""
from cic.http import make_handler


def health(req):
    return {"status": "ok"}


lambda_handler = make_handler({"GET /v1/health": health})
