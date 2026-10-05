"""The outgoing email seam (app/common/email.py). The SMTP server is the outer edge, faked here (AGENTS.md rule 3); the
real send to the local mail catcher is proven by tests/integration/smoke/test_smoke_applications.py, which reads the
message back from Mailpit."""

import smtplib
from unittest.mock import MagicMock, patch

import pytest

from app.common import email
from app.config.settings import get_settings


@pytest.fixture
def email_on(monkeypatch):
    settings = get_settings()
    monkeypatch.setattr(settings, "email_enabled", True)
    monkeypatch.setattr(settings, "smtp_host", "mail.test")
    monkeypatch.setattr(settings, "smtp_port", 2525)
    monkeypatch.setattr(settings, "smtp_starttls", False)
    monkeypatch.setattr(settings, "smtp_username", "")
    return settings


@pytest.mark.asyncio
async def test_nothing_is_sent_while_email_is_off(monkeypatch):
    monkeypatch.setattr(get_settings(), "email_enabled", False)
    with patch("app.common.email.smtplib.SMTP") as smtp:
        assert await email.send_email("a@example.test", "Hello", "Body") is False
    smtp.assert_not_called()


@pytest.mark.asyncio
async def test_a_message_is_handed_to_the_configured_server(email_on):
    server = MagicMock()
    with patch("app.common.email.smtplib.SMTP") as smtp:
        smtp.return_value.__enter__.return_value = server
        assert await email.send_email("a@example.test", "Approved", "Plain", "<p>Html</p>") is True
    smtp.assert_called_once_with("mail.test", 2525, timeout=15)
    sent = server.send_message.call_args.args[0]
    assert sent["To"] == "a@example.test"
    assert sent["Subject"] == "Approved"
    assert sent.get_body(("plain",)).get_content().strip() == "Plain"
    assert "<p>Html</p>" in sent.get_body(("html",)).get_content()
    server.starttls.assert_not_called()
    server.login.assert_not_called()


@pytest.mark.asyncio
async def test_a_real_provider_gets_starttls_and_a_login(email_on, monkeypatch):
    from pydantic import SecretStr

    monkeypatch.setattr(email_on, "smtp_starttls", True)
    monkeypatch.setattr(email_on, "smtp_username", "sender@example.test")
    monkeypatch.setattr(email_on, "smtp_password", SecretStr("app-password"))
    server = MagicMock()
    with patch("app.common.email.smtplib.SMTP") as smtp:
        smtp.return_value.__enter__.return_value = server
        assert await email.send_email("a@example.test", "Approved", "Plain") is True
    server.starttls.assert_called_once()
    server.login.assert_called_once_with("sender@example.test", "app-password")


@pytest.mark.asyncio
@pytest.mark.parametrize("failure", [ConnectionRefusedError(), smtplib.SMTPRecipientsRefused({})])
async def test_a_failed_send_is_reported_never_raised(email_on, failure):
    with patch("app.common.email.smtplib.SMTP", side_effect=failure):
        assert await email.send_email("a@example.test", "Approved", "Plain") is False
