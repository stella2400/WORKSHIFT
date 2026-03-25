"""
File parsers v7:
- Bulk shift parsing: reads ALL employee rows
- Workstation parsing: reads ALL employee rows (station codes per day)
- Supports search by matricola OR nome (last name first or full name)
"""
from __future__ import annotations
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, Iterable, Optional

from openpyxl import load_workbook
from docx import Document
from pypdf import PdfReader

MONTHS_IT = {
    "gennaio":1,"febbraio":2,"marzo":3,"aprile":4,"maggio":5,"giugno":6,
    "luglio":7,"agosto":8,"settembre":9,"ottobre":10,"novembre":11,"dicembre":12,
}
KNOWN_SHIFT_CODES = {"M","P","N","S","R","ASS","FER","MAL","PERM","ST","RP","REC"}


@dataclass
class ParsedMonth:
    month_label: str
    year: int
    month: int
    note: str = ""
    days: dict = field(default_factory=dict)
    days_by_employee: Dict[str, Dict[int, str]] = field(default_factory=dict)
    # employee_code -> {day -> station_code}
    stations_by_employee: Dict[str, Dict[int, str]] = field(default_factory=dict)


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _extract_month_year(text: str) -> tuple[str, int, int]:
    lower = text.lower()
    year_match = re.search(r"(20\d{2})", lower)
    year = int(year_match.group(1)) if year_match else 2026
    for name, num in MONTHS_IT.items():
        if name in lower:
            return f"{name.capitalize()} {year}", year, num
    return f"Mese sconosciuto {year}", year, 0


def _is_shift_code(token: str) -> bool:
    upper = token.upper().strip().rstrip(".,;")
    if upper in KNOWN_SHIFT_CODES:
        return True
    if re.fullmatch(r"\d{1,2}(?::\d{2})?[-\u2013]\d{1,2}(?::\d{2})?", upper):
        return True
    if re.fullmatch(r"[A-Z]{1,4}", upper):
        return True
    return False


def _is_station_code(token: str) -> bool:
    """Station codes like P1, P9, BOX1, A1, etc."""
    upper = token.upper().strip().rstrip(".,;")
    return bool(re.fullmatch(r"[A-Z]{1,4}\d{1,3}", upper))


def _extract_employee_key(cell_value: str, search_by: str = "matricola") -> Optional[str]:
    """
    Extract employee identifier from a cell.
    cell_value examples:
      - "6809 - CIPOLLA VIENNA"  (matricola - NAME)
      - "14902 - PICONE LUIGI"
      - "6809"
      - "CIPOLLA VIENNA"
    Returns: normalized key depending on search_by
    """
    if not cell_value:
        return None
    val = str(cell_value).strip()
    # Pattern: digits optionally followed by " - NAME" or "- NAME"
    m = re.match(r'^(\d{3,8})\s*[-–]\s*(.+)$', val)
    if m:
        matricola = m.group(1).strip()
        nome = m.group(2).strip().upper()
        if search_by == "matricola":
            return matricola
        else:
            return nome
    # Just digits = matricola
    if re.fullmatch(r'\d{3,8}', val):
        return val if search_by == "matricola" else None
    # Just text = name
    if not re.search(r'\d', val):
        return val.upper() if search_by == "nome" else None
    return None


def _parse_bulk_rows(
    rows: list[list],
    search_by: str = "matricola",
    mode: str = "shifts",   # "shifts" | "stations"
) -> ParsedMonth:
    """
    Parse a tabular file where:
    - Row with 'Matricola' (or similar) in col 0 = header row with day numbers
    - Subsequent rows: col0 = employee key, col1..N = shift/station codes per day
    """
    label, year, month = "Mese sconosciuto 2026", 2026, 0
    header_found = False
    day_col_map: Dict[int, int] = {}  # col_index -> day_number
    result: Dict[str, Dict[int, str]] = {}

    for row in rows:
        if not row or not any(c is not None for c in row):
            continue
        cells = [str(c).strip() if c is not None else "" for c in row]
        joined = " ".join(cells)

        # Extract month/year from any row
        if not label or label.startswith("Mese sconosciuto"):
            lbl, y, m = _extract_month_year(joined)
            if m > 0:
                label, year, month = lbl, y, m

        # Detect header row: col 0 contains "matricola" or "nome", remaining cols are day numbers
        if not header_found:
            col0_lower = cells[0].lower()
            if "matricola" in col0_lower or "nome" in col0_lower or col0_lower in ("", "mat"):
                # Check if remaining columns are day numbers (1-31)
                for ci, cell in enumerate(cells[1:], start=1):
                    try:
                        day = int(re.sub(r'\D', '', cell))
                        if 1 <= day <= 31:
                            day_col_map[ci] = day
                    except (ValueError, TypeError):
                        pass
                if day_col_map:
                    header_found = True
            continue

        if not day_col_map:
            continue

        # Employee row: col 0 = employee identifier
        emp_key = _extract_employee_key(cells[0], search_by)
        if not emp_key:
            continue

        days: Dict[int, str] = {}
        for ci, day in day_col_map.items():
            if ci < len(cells) and cells[ci]:
                code = cells[ci].upper().strip()
                if mode == "stations":
                    if _is_station_code(code):
                        days[day] = code
                else:
                    if code and not code.isdigit():
                        days[day] = code
        if days:
            result[emp_key] = days

    parsed = ParsedMonth(month_label=label, year=year, month=month,
                          note=f"Parsed {len(result)} rows (mode={mode}, search_by={search_by})")
    if mode == "stations":
        parsed.stations_by_employee = result
    else:
        parsed.days_by_employee = result
    return parsed


def _rows_from_xlsx(path: Path) -> list[list]:
    wb = load_workbook(path, data_only=True)
    rows = []
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            rows.append(list(row))
    return rows


def _rows_from_docx(path: Path) -> list[list]:
    doc = Document(path)
    rows = []
    for para in doc.paragraphs:
        if para.text.strip():
            rows.append([para.text.strip()])
    for table in doc.tables:
        for row in table.rows:
            rows.append([cell.text.strip() for cell in row.cells])
    return rows


def _rows_from_pdf(path: Path) -> list[list]:
    reader = PdfReader(str(path))
    rows = []
    for page in reader.pages:
        text = page.extract_text() or ""
        for line in text.splitlines():
            if line.strip():
                rows.append([line.strip()])
    return rows


def parse_xlsx_bulk(path: Path, search_by: str = "matricola", mode: str = "shifts") -> ParsedMonth:
    return _parse_bulk_rows(_rows_from_xlsx(path), search_by, mode)


def parse_docx_bulk(path: Path, search_by: str = "matricola", mode: str = "shifts") -> ParsedMonth:
    return _parse_bulk_rows(_rows_from_docx(path), search_by, mode)


def parse_pdf_bulk(path: Path, search_by: str = "matricola", mode: str = "shifts") -> ParsedMonth:
    return _parse_bulk_rows(_rows_from_pdf(path), search_by, mode)


# Single-user parsers (for image OCR fallback)
def parse_xlsx(path: Path, employee_code: str) -> ParsedMonth:
    rows = _rows_from_xlsx(path)
    parsed = _parse_bulk_rows(rows, "matricola", "shifts")
    days = parsed.days_by_employee.get(employee_code.upper(), {})
    if not days:
        for k, v in parsed.days_by_employee.items():
            if k.upper() == employee_code.upper():
                days = v; break
    if not days:
        raise ValueError(f"Matricola '{employee_code}' non trovata nel file.")
    return ParsedMonth(month_label=parsed.month_label, year=parsed.year, month=parsed.month, days=days,
                       note=f"Singolo utente {employee_code}")


def parse_docx(path: Path, employee_code: str) -> ParsedMonth:
    rows = _rows_from_docx(path)
    parsed = _parse_bulk_rows(rows, "matricola", "shifts")
    days = parsed.days_by_employee.get(employee_code.upper(), {})
    if not days:
        raise ValueError(f"Matricola '{employee_code}' non trovata.")
    return ParsedMonth(month_label=parsed.month_label, year=parsed.year, month=parsed.month, days=days,
                       note=f"Singolo utente {employee_code}")


def parse_pdf(path: Path, employee_code: str) -> ParsedMonth:
    rows = _rows_from_pdf(path)
    parsed = _parse_bulk_rows(rows, "matricola", "shifts")
    days = parsed.days_by_employee.get(employee_code.upper(), {})
    if not days:
        raise ValueError(f"Matricola '{employee_code}' non trovata.")
    return ParsedMonth(month_label=parsed.month_label, year=parsed.year, month=parsed.month, days=days,
                       note=f"Singolo utente {employee_code}")
