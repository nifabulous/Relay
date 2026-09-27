"""Request validation errors that survive non-finite numbers.

json.loads accepts the Infinity and NaN literals, so a rejected field can carry
a non-finite float in its error's "input". FastAPI's default handler then fails
to render the 422 (strict JSON has no infinity) and the request surfaces as an
unhandled 500. Render those values as strings and keep the default shape,
{"detail": [...]}, which the frontend's problem parser reads.
"""
import math

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


def _finite(value):
    if isinstance(value, float) and not math.isfinite(value):
        return str(value)
    if isinstance(value, dict):
        return {key: _finite(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [_finite(item) for item in value]
    return value


async def validation_error_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    return JSONResponse(
        status_code=422,
        content={"detail": _finite(jsonable_encoder(exc.errors()))},
    )
