"""P5 (item 11, gate G5): Sentry error tracking, off unless `SENTRY_DSN` is set.

With no DSN nothing is initialised, so every `sentry_sdk` call elsewhere in the app is a no-op and local
development, tests and CI never talk to a third party. Turning it on needs the maintainer to create the
Sentry project (docs/process/briefs/g5-sentry.md); until then the feature register keeps it `Blocked`.
"""

import logging
from typing import Any, cast

import sentry_sdk
from sentry_sdk.transport import Transport
from sentry_sdk.types import Event, Hint

from .config import Settings

logger = logging.getLogger(__name__)

# Headers that carry credentials or identity; dropped from every event rather than trusted to be absent.
_SENSITIVE_HEADERS = {"authorization", "cookie", "x-api-key", "apikey", "idempotency-key"}
_REDACTED = "[Filtered]"


def scrub_event(sentry_event: Event, _hint: Hint) -> Event | None:
    """`before_send` hook. The API carries phone numbers, addresses, chat messages and JWTs, so an
    event keeps only what is needed to find the bug: route, method, status, request id, stack.
    Bodies, query strings, cookies and credential headers are removed, as is any user identity
    beyond the opaque id (no email or IP)."""
    event = cast(dict[str, Any], sentry_event)  # the SDK types events as a TypedDict; this is plain dict work
    request = event.get("request")
    if isinstance(request, dict):
        request.pop("data", None)
        request.pop("cookies", None)
        request.pop("query_string", None)
        headers = request.get("headers")
        if isinstance(headers, dict):
            request["headers"] = {k: (_REDACTED if k.lower() in _SENSITIVE_HEADERS else v) for k, v in headers.items()}
    user = event.get("user")
    if isinstance(user, dict):
        event["user"] = {"id": user["id"]} if "id" in user else {}
    return sentry_event


def init_sentry(settings: Settings, transport: type[Transport] | None = None) -> bool:
    """Returns True when error tracking was switched on. `transport` exists so tests can capture the real
    outgoing events under this exact configuration."""
    if not settings.sentry_dsn:
        return False
    sentry_sdk.init(
        dsn=settings.sentry_dsn,
        environment=settings.environment,
        release=settings.model_version,
        send_default_pii=False,
        traces_sample_rate=0.0,
        # Stack-frame locals would include the raw ASGI scope (Authorization header) and request bodies:
        # the first version of this config leaked a bearer token that way, caught by test_observability.
        include_local_variables=False,
        transport=transport,
        before_send=scrub_event,
    )
    logger.info("Sentry error tracking enabled (environment=%s)", settings.environment)
    return True
