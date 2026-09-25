from collections.abc import Callable

import jwt
from fastapi import FastAPI, Request
from fastapi.routing import iter_route_contexts
from slowapi import Limiter
from slowapi.middleware import _should_exempt, async_check_limits
from slowapi.util import get_remote_address
from starlette.datastructures import MutableHeaders
from starlette.responses import Response
from starlette.routing import Match
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from .config import settings


def rate_limit_key(request: Request) -> str:
    """P5 (item 4): buckets by user id when a bearer token is present, else by IP — so one heavy
    user can't exhaust the shared IP bucket for everyone behind the same NAT/proxy, and a logged-in
    abuser can't dodge a per-IP limit by rotating source addresses.

    slowapi's `key_func` is a plain *synchronous* function called before FastAPI resolves its own
    dependency graph for the route, so it has no access to `get_current_user`'s already-verified
    result (that dependency hasn't run yet at this point, and can't — `key_func` isn't awaitable).
    Re-verifying here would mean either blocking on a JWKS fetch in a sync context (reintroducing
    the exact blocking-call problem elsewhere in this phase) or duplicating that logic. This reads
    the token's `sub` claim WITHOUT verifying its signature — deliberately: it is used only to pick
    a rate-limit bucket, never to authorize anything. A forged `sub` at worst buys the caller their
    own separate bucket, no worse than today's trivially-IP-rotated bucketing; the real
    authorization boundary (core/auth.py's get_current_user, require_role) is untouched and still
    verifies every request regardless of what bucket it landed in here.
    """
    authorization = request.headers.get("authorization", "")
    scheme, _, token = authorization.partition(" ")
    if scheme.lower() == "bearer" and token:
        try:
            claims = jwt.decode(token, options={"verify_signature": False})
            sub = claims.get("sub")
            if sub:
                return f"user:{sub}"
        except jwt.PyJWTError:
            # Malformed/undecodable token — falls through to the IP bucket below. get_current_user
            # still runs its own, real, signature-verified check later on this same request; a bad
            # token ends up rejected there with a 401 regardless of which bucket it was counted in.
            pass
    return f"ip:{get_remote_address(request)}"


# Defined in its own module (not inline in main.py) so endpoint modules can import `limiter` for
# a per-route `@limiter.limit(...)` override without importing from `main` -- `main` imports the
# API router, which imports the endpoint modules, so an endpoint importing back from `main` would
# be a circular import.
#
# The IP in `ip:<addr>` is the peer address as uvicorn reports it. Behind a load balancer that is the
# balancer's address for every caller unless uvicorn trusts the balancer's `X-Forwarded-For`, which it does
# only for the addresses in FORWARDED_ALLOW_IPS (default 127.0.0.1). A deployment must set that variable to
# its proxy's address (docs/setup/DEVELOPMENT_SETUP.md); trusting more than the real proxy would let any
# client pick its own bucket by sending the header.
limiter = Limiter(key_func=rate_limit_key, default_limits=[settings.rate_limit_default])


def _find_endpoint(app: FastAPI, scope: Scope) -> Callable | None:
    """The endpoint function this request will run, found the way FastAPI itself routes.

    slowapi's own lookup walks `app.routes` for routes that have an `endpoint`. Since FastAPI 0.141 an
    included router is one lazy `_IncludedRouter` with no `endpoint`, so slowapi found no handler for any
    `/api/v1` route, treated each as exempt, and silently stopped applying the default limit (caught by
    tests/integration/smoke/test_smoke_proxy_headers.py right after the upgrade). `iter_route_contexts`
    yields every route with its effective path, so matching works again."""
    handler = None
    for context in iter_route_contexts(app.routes):
        match, child_scope = context.matches(scope)
        if match == Match.FULL and child_scope.get("endpoint") is not None:
            handler = child_scope["endpoint"]
    return handler


class RateLimitMiddleware:
    """slowapi's default-limit check as a pure ASGI middleware, with the route lookup above. The limiting
    logic (`sync_check_limits`, `_inject_headers`) is slowapi's, unchanged."""

    _HEADER_PREFIXES = ("x-ratelimit", "retry-after")

    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        app: FastAPI = scope["app"]
        limiter: Limiter = app.state.limiter
        if not limiter.enabled:
            await self.app(scope, receive, send)
            return

        handler = _find_endpoint(app, scope)
        if _should_exempt(limiter, handler):
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)
        error_response, should_inject_headers = await async_check_limits(limiter, request, handler, app)
        if error_response is not None:
            await error_response(scope, receive, send)
            return
        if not should_inject_headers:
            await self.app(scope, receive, send)
            return

        async def send_with_limit_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                # slowapi writes its headers onto a Response object; borrow that and copy only its own.
                carrier = limiter._inject_headers(Response(), request.state.view_rate_limit)
                headers = MutableHeaders(scope=message)
                for name, value in carrier.headers.items():
                    if name.startswith(self._HEADER_PREFIXES):
                        headers[name] = value
            await send(message)

        await self.app(scope, receive, send_with_limit_headers)
