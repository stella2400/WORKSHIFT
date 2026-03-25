"""
Overtime calculation utilities.

Rule: overtime = hours_worked - standard_hours (from TeamConfig)
If hours_worked <= standard_hours => overtime = 0
"""
from __future__ import annotations
import re
from typing import Optional


_PATTERN = re.compile(r'^(\d{1,2})(?::(\d{2}))?[-\u2013](\d{1,2})(?::(\d{2}))?$')


def parse_time_code(code: str) -> Optional[tuple[float, str, str]]:
    """
    If code looks like a time range (e.g. '08-16', '08:00-16:00'), 
    return (hours_worked, 'HH:MM', 'HH:MM'). Else None.
    """
    m = _PATTERN.match(code.strip())
    if not m:
        return None
    sh, sm, eh, em = int(m.group(1)), int(m.group(2) or 0), int(m.group(3)), int(m.group(4) or 0)
    if not (0 <= sh <= 23 and 0 <= sm <= 59 and 0 <= eh <= 23 and 0 <= em <= 59):
        return None
    start_total = sh * 60 + sm
    end_total = eh * 60 + em
    if end_total <= start_total:
        end_total += 24 * 60   # overnight shift
    worked = (end_total - start_total) / 60.0
    return worked, f"{sh:02d}:{sm:02d}", f"{eh:02d}:{em:02d}"


def compute_overtime(hours_worked: float, standard_hours: float) -> float:
    """Returns overtime hours. Never negative."""
    return round(max(0.0, hours_worked - standard_hours), 2)


def hours_from_times(time_start: str, time_end: str) -> Optional[float]:
    """Calculate hours worked between two HH:MM strings."""
    try:
        sh, sm = map(int, time_start.split(":"))
        eh, em = map(int, time_end.split(":"))
    except (ValueError, AttributeError):
        return None
    start = sh * 60 + sm
    end = eh * 60 + em
    if end <= start:
        end += 24 * 60
    return round((end - start) / 60.0, 2)
