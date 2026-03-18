from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
import re

from openpyxl import load_workbook
from docx import Document
from pypdf import PdfReader


@dataclass
class ParsedMonth:
    month_label: str
    days: dict[int, str]
    note: str


MONTHS = {
    "gennaio": 1,
    "febbraio": 2,
    "marzo": 3,
    "aprile": 4,
    "maggio": 5,
    "giugno": 6,
    "luglio": 7,
    "agosto": 8,
    "settembre": 9,
    "ottobre": 10,
    "novembre": 11,
    "dicembre": 12,
}


def _normalize(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def _extract_month_label(text: str) -> str:
    lower = text.lower()
    year_match = re.search(r"(20\d{2})", lower)
    year = year_match.group(1) if year_match else "2026"
    for month in MONTHS:
        if month in lower:
            return f"{month} {year}"
    return f"mese non riconosciuto {year}"


def parse_text_matrix(lines: Iterable[str], employee_code: str) -> ParsedMonth:
    joined = "\n".join(_normalize(x) for x in lines if _normalize(x))
    month_label = _extract_month_label(joined)

    target_line = None
    code = employee_code.strip()
    for line in joined.splitlines():
        if code in line:
            target_line = line
            break

    if not target_line:
        raise ValueError(f"Matricola {employee_code} non trovata nel file")

    tokens = target_line.replace("-", " ").split()
    shift_tokens = []
    for token in tokens:
        upper = token.upper().strip()
        if upper in {"M", "P", "N", "S", "R", "ASS"}:
            shift_tokens.append(upper)

    if not shift_tokens:
        raise ValueError("Nessun turno riconosciuto nella riga del professionista")

    days = {idx: shift_tokens[idx - 1] for idx in range(1, min(31, len(shift_tokens)) + 1)}
    note = f"Parsing testuale automatico dalla riga contenente la matricola {employee_code}"
    return ParsedMonth(month_label=month_label, days=days, note=note)


def parse_xlsx(path: Path, employee_code: str) -> ParsedMonth:
    wb = load_workbook(path, data_only=True)
    lines: list[str] = []
    for ws in wb.worksheets:
        for row in ws.iter_rows(values_only=True):
            values = [str(cell) for cell in row if cell is not None]
            if values:
                lines.append(" ".join(values))
    return parse_text_matrix(lines, employee_code)


def parse_docx(path: Path, employee_code: str) -> ParsedMonth:
    doc = Document(path)
    lines = [p.text for p in doc.paragraphs if p.text.strip()]
    for table in doc.tables:
        for row in table.rows:
            values = [cell.text.strip() for cell in row.cells if cell.text.strip()]
            if values:
                lines.append(" ".join(values))
    return parse_text_matrix(lines, employee_code)


def parse_pdf(path: Path, employee_code: str) -> ParsedMonth:
    reader = PdfReader(str(path))
    lines: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        lines.extend(text.splitlines())
    return parse_text_matrix(lines, employee_code)


def parse_image_placeholder(path: Path, employee_code: str) -> ParsedMonth:
    raise ValueError(
        "Parsing immagini non configurato in questa build base. Per immagini usa PDF/Excel/Word oppure attiva un provider OCR dedicato."
    )
