"""Events -> map pipeline. Read README.md in this folder first.

sources/*  fetch real events (Ticketmaster, Meetup) and return EventIn rows
geocode    turns addresses into lat/lon (Nominatim, cached in the DB)
sync       runs every source, geocodes, upserts into the Event table
router     /api/events* endpoints the map UI calls
"""
