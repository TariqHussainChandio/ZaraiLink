from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from .api.v1.router import api_router
from .core.config import settings
from .core.rate_limit import limiter

app = FastAPI(title="ZaraiLink API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)

# `limiter`'s 200/minute-per-IP default (core/rate_limit.py) applies to every route automatically
# — a generous ceiling meant to stop abuse/scraping, not to throttle normal app usage. Individual
# endpoints that are unusually expensive (e.g. disease prediction, which runs model inference)
# override it with a tighter `@limiter.limit(...)`.
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)
app.add_middleware(SlowAPIMiddleware)

app.include_router(api_router)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}
