import logging
from collections.abc import AsyncIterator
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from postgrest.exceptions import APIError
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.ai.engine import load_classifier
from app.api_router import api_router
from app.common.logging_config import configure_logging
from app.common.observability import init_sentry
from app.common.openapi import customize as customize_openapi
from app.common.openapi import operation_id
from app.common.problem_details import (
    database_error_handler,
    http_exception_handler,
    rate_limit_exception_handler,
    unhandled_exception_handler,
    validation_exception_handler,
)
from app.config.settings import settings
from app.database.supabase_client import close_shared_clients, get_public_client, init_shared_clients
from app.middleware.http_middleware import MaxBodySizeMiddleware, RequestIDMiddleware, SecurityHeadersMiddleware
from app.middleware.rate_limit import RateLimitMiddleware, limiter

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    configure_logging()
    init_sentry(settings)
    # Loading here (once, at startup) rather than relying on get_classifier()'s own lazy fallback
    # means the first real prediction request doesn't pay the checkpoint-load cost — see
    # ai/engine.py for why this moved out of import-time entirely (P5, item 3).
    load_classifier()
    # P5 (item 2): the shared anon/service-role AsyncClient singletons. A bad SUPABASE_URL/key now
    # fails at boot instead of on whichever request happens to need it first.
    await init_shared_clients()
    yield
    await close_shared_clients()


app = FastAPI(
    title="ZaraiLink API",
    generate_unique_id_function=operation_id,
    lifespan=lifespan,
    docs_url="/docs" if settings.environment == "development" else None,
    redoc_url="/redoc" if settings.environment == "development" else None,
    openapi_url="/openapi.json" if settings.environment == "development" else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    # PUT is used by exactly one route (PUT /farmer/profile); the mobile app never sends a custom header beyond these
    # two, and never uses cookies, so allow_credentials stays explicitly False — bearer tokens only.
    allow_methods=["GET", "POST", "PATCH", "PUT", "DELETE"],
    allow_headers=["Authorization", "Content-Type"],
    allow_credentials=False,
)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(MaxBodySizeMiddleware)
app.add_middleware(RequestIDMiddleware)

app.add_exception_handler(StarletteHTTPException, http_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
app.add_exception_handler(APIError, database_error_handler)
app.add_exception_handler(Exception, unhandled_exception_handler)

# `limiter`'s 200/minute default (middleware/rate_limit.py, keyed by user id when authenticated else IP)
# applies to every route automatically — a generous ceiling meant to stop abuse/scraping, not to
# throttle normal app usage. Individual endpoints that are unusually expensive (e.g. disease
# prediction, which runs model inference) override it with a tighter `@limiter.limit(...)`.
app.state.limiter = limiter
# slowapi types its handler for RateLimitExceeded; Starlette types handlers as taking any Exception.
app.add_exception_handler(RateLimitExceeded, rate_limit_exception_handler)
app.add_middleware(RateLimitMiddleware)

app.include_router(api_router)
customize_openapi(app)


@app.get("/health/live")
def liveness() -> dict[str, str]:
    """Process is up and serving — says nothing about Supabase reachability. See /health/ready
    for that."""
    return {"status": "ok"}


@app.get("/health")
def health() -> dict[str, str]:
    """Deprecated alias for /health/live, kept for one release for any external monitor already
    pointed at the old path."""
    return liveness()


@app.get("/health/ready")
async def readiness() -> dict[str, str]:
    # A cheap, always-populated, anon-readable table — proves PostgREST + the anon grant chain are
    # actually answering, not just that a TCP socket accepts a connection.
    try:
        await get_public_client().table("categories").select("id").limit(1).execute()
    # APIError: PostgREST answered but rejected the request (bad grants, etc). httpx.HTTPError:
    # a network-level failure before PostgREST could even respond — the same pairing
    # ai/service.py already uses for its own Supabase Storage calls.
    except (APIError, httpx.HTTPError) as exc:
        logger.warning("Readiness check failed: %s", exc)
        raise HTTPException(status_code=503, detail="Supabase unreachable") from exc
    return {"status": "ok"}


@app.get("/version")
def version() -> dict[str, str]:
    return {"version": settings.model_version, "environment": settings.environment}
