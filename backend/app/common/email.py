"""Outgoing email: the seam every email the API sends goes through (A3b; SRDS §8, §9, §11).

Standard library only (`smtplib`, `email.message`): one SMTP submission per message, which is all the approval and
rejection emails need. The send runs in a worker thread, because `smtplib` blocks and the handlers share one event
loop. A failure never reaches the request that caused it: the decision it reports has already been committed, so the
caller is told `False` and says so to the admin instead of failing a decision that happened.

Locally the settings point at the Supabase stack's mail catcher (Mailpit), where the smoke tests read the message
back. The hosted API sends nothing until gate G1 configures a provider (docs/process/briefs/g1-smtp.md).
"""

import asyncio
import logging
import smtplib
from email.message import EmailMessage

from app.config.settings import get_settings

logger = logging.getLogger(__name__)

# Long enough for a real provider's greeting, short enough that a dead server does not hold the admin's request.
_TIMEOUT_SECONDS = 15


def _build(to: str, subject: str, text: str, html: str | None) -> EmailMessage:
    message = EmailMessage()
    message["From"] = get_settings().smtp_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)
    if html is not None:
        message.add_alternative(html, subtype="html")
    return message


def _deliver(message: EmailMessage) -> None:
    settings = get_settings()
    with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=_TIMEOUT_SECONDS) as server:
        if settings.smtp_starttls:
            server.starttls()
        if settings.smtp_username:
            server.login(settings.smtp_username, settings.smtp_password.get_secret_value())
        server.send_message(message)


async def send_email(to: str, subject: str, text: str, html: str | None = None) -> bool:
    """Sends one message; True once the SMTP server accepted it. False, never an exception, when email is off or the
    server refused or could not be reached; the reason goes to the log (without the message body)."""
    if not get_settings().email_enabled:
        logger.info("email not sent: email is off in this environment", extra={"subject": subject})
        return False
    try:
        await asyncio.to_thread(_deliver, _build(to, subject, text, html))
    except (OSError, smtplib.SMTPException) as exc:
        logger.warning("email not sent: %s", type(exc).__name__, extra={"subject": subject})
        return False
    return True
