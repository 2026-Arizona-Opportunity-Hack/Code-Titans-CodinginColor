"""API error types. Raise these anywhere in a handler; cic.http turns them into responses."""
from typing import Any, Optional


class ApiError(Exception):
    """An error that maps to a specific HTTP status and machine-readable code."""

    status_code = 500
    code = "INTERNAL_ERROR"

    def __init__(
        self,
        message: str,
        code: Optional[str] = None,
        details: Optional[Any] = None,
        headers: Optional[dict] = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        if code:
            self.code = code
        self.details = details
        self.headers = headers or {}


class ValidationError(ApiError):
    status_code = 400
    code = "VALIDATION_ERROR"


class Unauthenticated(ApiError):
    status_code = 401
    code = "UNAUTHENTICATED"


class Forbidden(ApiError):
    status_code = 403
    code = "FORBIDDEN"


class NotFound(ApiError):
    status_code = 404
    code = "NOT_FOUND"


class Conflict(ApiError):
    status_code = 409
    code = "CONFLICT"


class RateLimited(ApiError):
    status_code = 429
    code = "RATE_LIMITED"
