"""Event reminders: "Remind me the day before" emails.

Every few minutes, anyone who turned on a reminder for an event starting within the next 24 hours gets one email
(through the same mailer as password resets; without SMTP it is printed in the backend terminal). Each reminder is
sent once, recorded in ReminderSent.
"""

import asyncio
import logging
from datetime import timedelta

from sqlmodel import Session, select

from ..config import settings
from ..db import engine
from ..mailer import send_email
from ..models import User
from .calgary_time import local
from .models import Event, EventSave, ReminderSent, utcnow

log = logging.getLogger("reminders")


def _when(e: Event) -> str:
    start = local(e.start)
    return start.strftime("%A, %B %-d at %-I:%M %p").replace("AM", "a.m.").replace("PM", "p.m.")


def send_due_reminders(session: Session) -> int:
    """Send every reminder that is due now. Returns how many were sent."""
    now = utcnow()
    rows = session.exec(
        select(EventSave, Event, User)
        .join(Event, Event.id == EventSave.event_id)
        .join(User, User.id == EventSave.user_id)
        .where(EventSave.reminder == True, Event.start > now, Event.start <= now + timedelta(hours=24))  # noqa: E712
    ).all()
    sent = 0
    for save, event, user in rows:
        if session.get(ReminderSent, (event.id, user.id)) is not None:
            continue
        place = event.venue_name or event.address or ("Online" if event.is_online else "")
        body = (f"Hi {user.name},\n\nA reminder that {event.title} is coming up:\n\n"
                f"  When: {_when(event)}\n" + (f"  Where: {place}\n" if place else "") +
                f"\nSee who's going, or find someone to go with: {settings.app_url}/#/\n\n"
                "You're getting this because you turned on \"Remind me the day before\" in Nexus.\n")
        send_email(user.email, f"Tomorrow: {event.title}", body)
        session.add(ReminderSent(event_id=event.id, user_id=user.id))
        sent += 1
    session.commit()
    return sent


async def _loop() -> None:
    while True:
        try:
            with Session(engine) as session:
                n = await asyncio.to_thread(send_due_reminders, session)
            if n:
                log.info("Sent %d event reminder(s)", n)
        except Exception:  # never let one bad run stop future reminders
            log.exception("Reminder run failed")
        await asyncio.sleep(settings.reminder_check_minutes * 60)


def start_reminders() -> asyncio.Task | None:
    if settings.reminder_check_minutes <= 0:
        return None
    return asyncio.create_task(_loop())
