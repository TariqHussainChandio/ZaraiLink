"""P5 (item 4, HTTP hardening): request-ID propagation and a size cap on request bodies. Both are
pure ASGI middleware with no new dependency — the codebase's own "libraries over
hand-rolled code" preference doesn't apply here, since no single-purpose library does exactly this
at the ASGI layer without pulling in something much larger (a full WAF/gateway)."""

import uuid

import sentry_sdk
from starlette.datastructures import Headers, MutableHeaders
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.common.problem_details import problem_response
from app.middleware.request_context import request_id_var

# These are written as plain ASGI callables, not `BaseHTTPMiddleware` subclasses: each BaseHTTPMiddleware
# layer re-wraps the request and response streams, and three of them (plus slowapi's) cost about 15% of
# throughput on public reads in the k6 runs (docs/architecture/adr/0001). ASGI middleware is the same logic
# without that cost.


class RequestIDMiddleware:
    """Trusts an inbound `X-Request-ID` if present (an upstream proxy/load balancer's own id,
    letting a request be traced across hops), otherwise mints one. Always echoed back so a client
    can correlate its own logs with ours. Each request runs in its own task, so the ContextVar is not
    reset afterwards; that also keeps the id visible to the 500 handler, which runs outside this layer."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        request_id = Headers(scope=scope).get("x-request-id") or uuid.uuid4().hex
        request_id_var.set(request_id)
        sentry_sdk.set_tag("request_id", request_id)  # lets an event be matched to the JSON logs; no-op when off

        async def send_with_id(message: Message) -> None:
            if message["type"] == "http.response.start":
                MutableHeaders(scope=message)["X-Request-ID"] = request_id
            await send(message)

        await self.app(scope, receive, send_with_id)


class SecurityHeadersMiddleware:
    """A pure JSON API serves no HTML except Swagger/ReDoc (already gated to dev-only elsewhere),
    so a default-deny CSP is safe here without needing per-route exceptions."""

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        https = scope.get("scheme") == "https"

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                headers = MutableHeaders(scope=message)
                headers["X-Content-Type-Options"] = "nosniff"
                headers["X-Frame-Options"] = "DENY"
                headers["Referrer-Policy"] = "no-referrer"
                headers["Content-Security-Policy"] = "default-src 'none'"
                if https:
                    headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
            await send(message)

        await self.app(scope, receive, send_with_headers)


class MaxBodySizeMiddleware:
    """Rejects an oversized request body before it is buffered. Comfortably above the largest legitimate
    upload today (the disease-images bucket's own 8 MB limit, enforced separately in ai/service.py) so
    this is a backstop against a deliberately huge body consuming memory, not a normal-usage limit.

    Two checks, because `Content-Length` is only a claim: a declared size over the cap is refused outright,
    and the bytes actually received are counted, so a chunked body (no `Content-Length`) or one that lies
    about its size is cut off at the cap too (found by the independent P5 verification). The overrun is
    raised as an HTTP 413 from `receive`, which FastAPI passes through to the problem+json handler."""

    def __init__(self, app: ASGIApp, max_bytes: int = 10 * 1024 * 1024) -> None:
        self.app = app
        self._max_bytes = max_bytes

    def _too_large(self) -> StarletteHTTPException:
        return StarletteHTTPException(status_code=413, detail=f"Body exceeds the {self._max_bytes} byte limit.")

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        content_length = Headers(scope=scope).get("content-length")
        if content_length is not None and content_length.isdigit() and int(content_length) > self._max_bytes:
            response = problem_response(
                status_code=413,
                title="Request body too large",
                detail=f"Body exceeds the {self._max_bytes} byte limit.",
                instance=scope["path"],
            )
            await response(scope, receive, send)
            return

        received = 0

        async def counted_receive() -> Message:
            nonlocal received
            message = await receive()
            if message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > self._max_bytes:
                    raise self._too_large()
            return message

        await self.app(scope, counted_receive, send)
