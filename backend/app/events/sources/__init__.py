"""One module per event source. Each exposes:

    NAME: str
    def configured() -> bool                      # has the key/token it needs
    async def fetch(lat, lon, radius_km, days) -> list[EventIn]

To add a source (e.g. Eventbrite organizers, City of Calgary calendar): copy ticketmaster.py,
then add it to SOURCES below. Only real data: a source without a key returns nothing.
"""

from . import meetup, ticketmaster

SOURCES = [ticketmaster, meetup]
