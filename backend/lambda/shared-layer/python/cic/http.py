"""HTTP API (payload v2) request and response helpers shared by every Lambda.

Each Lambda declares a dict of route key -> function and exposes
`lambda_handler = make_handler(ROUTES)`. The route key is the same string used
in CDK (for example "GET /v1/classes/{classId}/progress"), so API Gateway does
the path matching and we never parse paths by hand.

Handlers return plain data (sent as 200 inside the {"data": ...} envelope) or a
Reply for other statuses, headers, or pagination metadata.
"""
import json
import os
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Any, Callable, Dict, Optional

from .errors import ApiError, NotFound, ValidationError
from .log import log

MAX_BODY_BYTES = 256 * 1024

ALLOWED_HEADERS = "Content-Type,Authorization,X-Api-Key,If-Match"
ALLOWED_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS"


@dataclass
class Reply:
    data: Any = None
    status: int = 200
    meta: Optional[dict] = None
    headers: Dict[str, str] = field(default_factory=dict)
    raw: Optional[str] = None  # send this text as-is (for example CSV) instead of the JSON envelope
    content_type: str = "application/json"


@dataclass
class Request:
    method: str
    route_key: str
    path: Dict[str, str]
    query: Dict[str, str]
    headers: Dict[str, str]
    raw_body: Optional[str]
    request_id: str
    origin: Optional[str]
    auth: Dict[str, Any]

    def json(self) -> dict:
        """Parse the body as a JSON object. Raises ValidationError if invalid."""
        if not self.raw_body:
            raise ValidationError("Request body is required")
        if len(self.raw_body.encode("utf-8")) > MAX_BODY_BYTES:
            raise ValidationError("Request body is too large")
        try:
            body = json.loads(self.raw_body)
        except json.JSONDecodeError:
            raise ValidationError("Request body is not valid JSON")
        if not isinstance(body, dict):
            raise ValidationError("Request body must be a JSON object")
        return body


def _json_default(value: Any) -> Any:
    if isinstance(value, Decimal):
        return int(value) if value == value.to_integral_value() else float(value)
    if isinstance(value, (set, frozenset)):
        return sorted(value)
    raise TypeError(f"Cannot serialize {type(value).__name__}")


def allowed_origins() -> list:
    raw = os.environ.get("ALLOWED_ORIGINS", "")
    return [o.strip() for o in raw.split(",") if o.strip()]


def cors_headers(origin: Optional[str]) -> Dict[str, str]:
    """Reflect the request origin only if it is on the allowlist."""
    headers = {
        "Access-Control-Allow-Headers": ALLOWED_HEADERS,
        "Access-Control-Allow-Methods": ALLOWED_METHODS,
        "Vary": "Origin",
    }
    if origin and origin in allowed_origins():
        headers["Access-Control-Allow-Origin"] = origin
    return headers


def create_response(
    status_code: int,
    body: Any,
    origin: Optional[str] = None,
    extra_headers: Optional[Dict[str, str]] = None,
    raw_body: Optional[str] = None,
) -> dict:
    """Build an API Gateway response with CORS headers. Used for every response, including errors."""
    headers = {"Content-Type": "application/json", "Cache-Control": "no-store"}
    headers.update(cors_headers(origin))
    if extra_headers:
        headers.update(extra_headers)
    return {
        "statusCode": status_code,
        "headers": headers,
        "body": raw_body if raw_body is not None else json.dumps(body, default=_json_default),
    }


def error_body(message: str, code: str, request_id: str, details: Any = None) -> dict:
    body = {"error": message, "code": code, "requestId": request_id}
    if details is not None:
        body["details"] = details
    return body


def build_request(event: dict) -> Request:
    ctx = event.get("requestContext") or {}
    http = ctx.get("http") or {}
    headers = {str(k).lower(): v for k, v in (event.get("headers") or {}).items()}
    return Request(
        method=http.get("method", ""),
        route_key=event.get("routeKey", ""),
        path=event.get("pathParameters") or {},
        query=event.get("queryStringParameters") or {},
        headers=headers,
        raw_body=event.get("body"),
        request_id=ctx.get("requestId", ""),
        origin=headers.get("origin"),
        auth=ctx.get("authorizer") or {},
    )


def make_handler(routes: Dict[str, Callable[[Request], Any]]) -> Callable:
    """Return a lambda_handler that dispatches on routeKey and maps errors to responses."""

    def lambda_handler(event, context):
        req = build_request(event)
        try:
            if req.method == "OPTIONS":
                return create_response(204, None, req.origin)
            fn = routes.get(req.route_key)
            if fn is None:
                raise NotFound("Not found")
            result = fn(req)
            reply = result if isinstance(result, Reply) else Reply(data=result)
            if reply.raw is not None:
                raw_headers = {"Content-Type": reply.content_type, **reply.headers}
                return create_response(reply.status, None, req.origin, raw_headers, raw_body=reply.raw)
            envelope: Dict[str, Any] = {"data": reply.data}
            if reply.meta is not None:
                envelope["meta"] = reply.meta
            return create_response(reply.status, envelope, req.origin, reply.headers)
        except ApiError as e:
            if e.status_code >= 500:
                log("api_error", level="ERROR", route=req.route_key, code=e.code, requestId=req.request_id)
            body = error_body(e.message, e.code, req.request_id, e.details)
            return create_response(e.status_code, body, req.origin, e.headers)
        except Exception as e:  # unexpected: log details, return a generic message
            log("unhandled_error", level="ERROR", route=req.route_key, requestId=req.request_id, errorType=type(e).__name__)
            body = error_body("Internal error", "INTERNAL_ERROR", req.request_id)
            return create_response(500, body, req.origin)

    return lambda_handler
