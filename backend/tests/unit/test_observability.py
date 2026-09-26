"""P5 (item 11): Sentry is off without a DSN, and what it sends when on carries no personal data.

The transport is replaced with an in-memory one, so this proves what leaves the process (the real
serialized event) without contacting Sentry. The live smoke test against a real Sentry project stays
blocked on the maintainer (docs/process/briefs/g5-sentry.md).
"""

from typing import Any, cast

import sentry_sdk
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sentry_sdk.transport import Transport
from sentry_sdk.types import Event

from app.core.config import Settings
from app.core.middleware import RequestIDMiddleware
from app.core.observability import init_sentry, scrub_event
from app.core.problem_details import unhandled_exception_handler


class _Capture(Transport):
    def __init__(self, options):
        super().__init__(options)
        self.events: list[dict] = []

    def capture_envelope(self, envelope):
        event = envelope.get_event()
        if event is not None:
            self.events.append(event)


def _settings(dsn: str = "http://public@localhost/1") -> Settings:
    return Settings.model_construct(sentry_dsn=dsn, environment="development", model_version="test")


def test_no_dsn_leaves_sentry_off():
    assert init_sentry(_settings("")) is False


def test_scrub_event_removes_bodies_credentials_and_contact_details():
    event = {
        "request": {
            "data": {"phone": "+923001234567"},
            "cookies": {"s": "1"},
            "query_string": "q=secret",
            "headers": {"Authorization": "Bearer abc", "Idempotency-Key": "k", "Accept": "json"},
        },
        "user": {"id": "u1", "email": "a@b.test", "ip_address": "1.2.3.4"},
    }
    clean = cast(dict[str, Any], scrub_event(cast(Event, event), {}))
    assert "data" not in clean["request"]
    assert "cookies" not in clean["request"]
    assert "query_string" not in clean["request"]
    assert clean["request"]["headers"] == {
        "Authorization": "[Filtered]",
        "Idempotency-Key": "[Filtered]",
        "Accept": "json",
    }
    assert clean["user"] == {"id": "u1"}


def test_an_unhandled_error_is_reported_with_its_request_id_and_no_credentials():
    app = FastAPI()
    app.add_middleware(RequestIDMiddleware)
    app.add_exception_handler(Exception, unhandled_exception_handler)

    @app.post("/boom")
    def boom() -> None:
        raise RuntimeError("kaboom")

    assert init_sentry(_settings(), transport=_Capture) is True
    try:
        response = TestClient(app, raise_server_exceptions=False).post(
            "/boom",
            json={"phone": "+923001234567"},
            headers={"Authorization": "Bearer secret", "X-Request-ID": "rid-1"},
        )
        assert response.status_code == 500
        transport = sentry_sdk.get_client().transport
        assert isinstance(transport, _Capture)
        assert transport.events, "the error was not reported"
        sent = transport.events[0]
        assert sent["tags"]["request_id"] == "rid-1"
        assert "secret" not in str(sent)
        assert "+923001234567" not in str(sent)
    finally:
        sentry_sdk.get_client().close()
        sentry_sdk.init()  # back to disabled for the rest of the suite


def test_the_scrub_hook_is_actually_installed_on_the_client():
    """The captured-request test above would also pass on the SDK's own defaults, so this sends an event
    that only `scrub_event` removes data from (an explicit request body and credential header)."""
    assert init_sentry(_settings(), transport=_Capture) is True
    try:
        sentry_sdk.capture_event(
            {
                "message": "probe",
                "request": {"data": {"phone": "+923009999999"}, "headers": {"Authorization": "Bearer probe-token"}},
            }
        )
        transport = sentry_sdk.get_client().transport
        assert isinstance(transport, _Capture)
        assert transport.events, "the probe event was not sent"
        sent = str(transport.events[0])
        assert "+923009999999" not in sent
        assert "probe-token" not in sent
    finally:
        sentry_sdk.get_client().close()
        sentry_sdk.init()
