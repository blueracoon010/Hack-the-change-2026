"""Sends email (password resets). Uses SMTP when SMTP_HOST is set, otherwise prints to the backend terminal."""

import logging
import smtplib
import ssl
from email.message import EmailMessage

from .config import settings

log = logging.getLogger("mailer")


def email_configured() -> bool:
    return bool(settings.smtp_host and settings.mail_from)


def send_email(to: str, subject: str, body: str) -> None:
    if not email_configured():
        # Dev fallback: only whoever runs this backend can see it (they already have database access).
        print(f"\n===== EMAIL (not sent: SMTP_HOST not set) =====\nTo: {to}\nSubject: {subject}\n\n{body}\n================================================\n", flush=True)
        return
    msg = EmailMessage()
    msg["From"], msg["To"], msg["Subject"] = settings.mail_from, to, subject
    msg.set_content(body)
    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port, timeout=15) as smtp:
            smtp.starttls(context=ssl.create_default_context())
            if settings.smtp_user:
                smtp.login(settings.smtp_user, settings.smtp_password)
            smtp.send_message(msg)
    except (smtplib.SMTPException, OSError):
        log.exception("Could not send email to %s", to)  # never tell the client: avoids revealing which emails exist
