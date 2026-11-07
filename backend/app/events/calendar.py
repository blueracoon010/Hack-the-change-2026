"""RFC 5545 export: UTC dates, escaped text, stable IDs, UTF-8 line folding."""
from datetime import timedelta
from .models import utcnow
from .schemas import to_utc

def escape(value: str) -> str:
    return value.replace('\\', '\\\\').replace('\r\n', '\n').replace('\r', '\n').replace('\n', '\\n').replace(';', '\\;').replace(',', '\\,')

def fold(line: str) -> str:
    chunks, current, size = [], '', 0
    for char in line:
        width = len(char.encode('utf-8'))
        if size + width > 75:
            chunks.append(current)
            current, size = ' ', 1
        current += char
        size += width
    chunks.append(current)
    return '\r\n'.join(chunks)

def calendar_file(events) -> str:
    stamp = utcnow().strftime('%Y%m%dT%H%M%SZ')
    lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Nexus//My Events//EN', 'CALSCALE:GREGORIAN', 'X-WR-CALNAME:Nexus - Going', 'X-WR-TIMEZONE:America/Edmonton']
    for event in events:
        start = to_utc(event.start)
        end = to_utc(event.end) if event.end else start + timedelta(hours=2)
        if end <= start:
            end = start + timedelta(hours=2)
        lines += ['BEGIN:VEVENT', f'UID:nexus-event-{event.id}@nexus.local', f'DTSTAMP:{stamp}',
                  f'DTSTART:{start.strftime("%Y%m%dT%H%M%SZ")}', f'DTEND:{end.strftime("%Y%m%dT%H%M%SZ")}',
                  f'SUMMARY:{escape(event.title)}', f'LOCATION:{escape(", ".join(filter(None, [event.venue_name, event.address])))}',
                  f'DESCRIPTION:{escape(event.description or "")}', 'CLASS:PRIVATE', 'STATUS:CONFIRMED', 'END:VEVENT']
    lines.append('END:VCALENDAR')
    return '\r\n'.join(fold(line) for line in lines) + '\r\n'
