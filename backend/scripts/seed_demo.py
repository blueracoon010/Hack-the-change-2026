"""Demo data for showing "Wants company" and direct messages.

Creates two demo accounts in whatever database DATABASE_URL points at (the shared one, from backend/.env):
  * Maya Chen: becomes friends (mutual follow) with you, asks for a buddy at an upcoming event, and messages you.
  * Jordan Lee: a stranger who asks for a buddy at the same event (shows up only as a count).
Nobody can sign in to these accounts (random passwords that are never shown).

Run from backend/:
  .venv/bin/python -m scripts.seed_demo --email you@example.com [--event 118]
  .venv/bin/python -m scripts.seed_demo --email you@example.com --busy   # also give your friends a demo week of busy time
  .venv/bin/python -m scripts.seed_demo --remove        # delete the demo accounts, demo busy times and everything they made
"""

import argparse
import secrets
from datetime import datetime, timedelta

from sqlmodel import Session, select

from app.db import engine, init_db
from app.dm.models import DirectMessage
from app.events.models import Event, EventRsvp, utcnow
from app.events.calgary_time import to_utc, local
from app.models import Follow, User
from app.schedule.models import BusyBlock
from app.routers.users import delete_me
from app.security import hash_password

DEMO = {
    "maya": ("Maya Chen", "maya.chen@demo.nexus.test"),
    "jordan": ("Jordan Lee", "jordan.lee@demo.nexus.test"),
}


def _user(session: Session, name: str, email: str) -> User:
    u = session.exec(select(User).where(User.email == email)).first()
    if u is None:
        u = User(name=name, email=email, password_hash=hash_password(secrets.token_urlsafe(24)))
        session.add(u)
        session.commit()
        session.refresh(u)
    return u


def _follow(session: Session, a: int, b: int) -> None:
    if session.get(Follow, (a, b)) is None:
        session.add(Follow(follower_id=a, following_id=b))


def seed(email: str, event_id: int | None = None) -> None:
    with Session(engine) as session:
        me = session.exec(select(User).where(User.email == email.strip().lower())).first() \
            or session.exec(select(User).where(User.email == email.strip())).first()
        if me is None:
            raise SystemExit(f"No account with email {email}. Sign up in the app first.")
        maya, jordan = (_user(session, *DEMO[k]) for k in ("maya", "jordan"))
        _follow(session, maya.id, me.id)
        _follow(session, me.id, maya.id)

        # The event you pick, or the soonest public, mappable event at least a day away.
        event = session.get(Event, event_id) if event_id else session.exec(select(Event).where(Event.visibility == "public", Event.lat.is_not(None),
                                                 Event.start >= utcnow() + timedelta(days=1))
                             .order_by(Event.start)).first()
        if event is None:
            raise SystemExit("No upcoming events to attach the demo to. Run an events sync first.")
        for person in (maya, jordan):
            r = session.get(EventRsvp, (event.id, person.id)) or EventRsvp(event_id=event.id, user_id=person.id)
            r.looking_for_buddy = True
            session.add(r)

        if not session.exec(select(DirectMessage).where(DirectMessage.sender_id == maya.id, DirectMessage.recipient_id == me.id)).first():
            session.add(DirectMessage(sender_id=maya.id, recipient_id=me.id,
                                      text=f"Hey! I'm thinking of going to {event.title}. Want to come with me?"))
        session.commit()
        print(f"Demo ready for {me.name}: Maya (friend) and Jordan (stranger) want company at "
              f"\"{event.title}\" (event {event.id}). Maya sent you a message.")


DEMO_LABEL = "Demo"
# Weekday (0 = Monday) -> list of (start hour, end hour, kind), Calgary time. A believable week, so the planner
# shows real overlaps: some evenings everyone is free, some times only part of the group is.
BUSY_PATTERNS = [
    {0: [(9, 17, "work")], 1: [(9, 17, "work")], 2: [(9, 17, "work"), (18, 20, "busy")], 3: [(9, 17, "work")], 4: [(9, 15, "work")], 5: [(13, 16, "busy")]},
    {0: [(12, 14, "class")], 1: [(10, 13, "class"), (17, 19, "busy")], 3: [(10, 13, "class"), (19, 21, "busy")], 6: [(11, 14, "busy")]},
    {0: [(18, 20, "busy")], 2: [(12, 15, "class")], 4: [(16, 19, "busy")], 5: [(9, 12, "work")]},
]


def seed_busy(email: str) -> None:
    """Give each of your friends (mutual follows) a demo week of busy time, labelled "Demo". Replaces old demo blocks."""
    with Session(engine) as session:
        me = session.exec(select(User).where(User.email == email.strip().lower())).first()
        if me is None:
            raise SystemExit(f"No account with email {email}.")
        following = set(session.exec(select(Follow.following_id).where(Follow.follower_id == me.id)).all())
        followers = set(session.exec(select(Follow.follower_id).where(Follow.following_id == me.id)).all())
        friends = session.exec(select(User).where(User.id.in_(following & followers)).order_by(User.id)).all()
        today = local(utcnow()).date()
        for n, friend in enumerate(friends):
            for old in session.exec(select(BusyBlock).where(BusyBlock.user_id == friend.id, BusyBlock.label == DEMO_LABEL)).all():
                session.delete(old)
            pattern = BUSY_PATTERNS[n % len(BUSY_PATTERNS)]
            for d in range(14):
                day = today + timedelta(days=d)
                for start_h, end_h, kind in pattern.get(day.weekday(), []):
                    wall = datetime(day.year, day.month, day.day)
                    session.add(BusyBlock(user_id=friend.id, kind=kind, label=DEMO_LABEL,
                                          start=to_utc(wall.replace(hour=start_h)), end=to_utc(wall.replace(hour=end_h))))
            print(f"Demo busy week for {friend.name}")
        session.commit()


def remove() -> None:
    with Session(engine) as session:
        for name, email in DEMO.values():
            u = session.exec(select(User).where(User.email == email)).first()
            if u:
                delete_me(user=u, session=session)  # same cleanup as "Delete my account"
                print(f"Removed {name}")
        n = 0
        for b in session.exec(select(BusyBlock).where(BusyBlock.label == DEMO_LABEL)).all():
            session.delete(b); n += 1
        session.commit()
        print(f"Removed {n} demo busy blocks")


if __name__ == "__main__":
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--email", help="your account's email: Maya becomes your friend")
    p.add_argument("--event", type=int, help="event id to attach the buddy requests to (default: the soonest one)")
    p.add_argument("--busy", action="store_true", help="also add a demo week of busy time for your friends")
    p.add_argument("--remove", action="store_true", help="delete the demo accounts")
    args = p.parse_args()
    init_db()
    if args.remove:
        remove()
    elif args.email:
        seed(args.email, args.event)
        if args.busy:
            seed_busy(args.email)
    else:
        p.error("pass --email you@example.com, or --remove")
