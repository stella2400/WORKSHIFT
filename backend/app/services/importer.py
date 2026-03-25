from __future__ import annotations
from datetime import date
from pathlib import Path
from typing import List, Tuple

from sqlmodel import Session, delete, select

from app.models.entities import (
    ShiftDefinition, ShiftEntry, Upload, User,
    WorkStationDefinition, WorkStationEntry,
)
from app.utils.file_parsers import ParsedMonth, parse_xlsx_bulk, parse_docx_bulk, parse_pdf_bulk
from app.utils.overtime import hours_from_times, compute_overtime

IMAGE_SUFFIXES = {".png", ".jpg", ".jpeg", ".webp"}
BULK_PARSERS = {
    ".xlsx": parse_xlsx_bulk, ".xlsm": parse_xlsx_bulk,
    ".docx": parse_docx_bulk, ".pdf": parse_pdf_bulk,
}


class BulkImportResult:
    def __init__(self):
        self.processed: List[str] = []
        self.skipped: List[str] = []
        self.errors: List[Tuple[str, str]] = []
        self.month_label: str = ""


class ImportService:

    def single_user_import(self, session, target_user, uploaded_by, stored_path, original_filename, standard_hours=6.0):
        path = Path(stored_path)
        suffix = path.suffix.lower()
        if suffix in IMAGE_SUFFIXES:
            from app.utils.image_ocr import parse_image_with_ai
            parsed = parse_image_with_ai(path, target_user.employee_code)
        elif suffix in BULK_PARSERS:
            bulk = BULK_PARSERS[suffix](path, "matricola", "shifts")
            days = bulk.days_by_employee.get(target_user.employee_code.upper(), {})
            if not days:
                for k, v in bulk.days_by_employee.items():
                    if k.upper() == target_user.employee_code.upper():
                        days = v; break
            if not days:
                raise ValueError(f"Matricola '{target_user.employee_code}' non trovata nel file.")
            parsed = ParsedMonth(month_label=bulk.month_label, year=bulk.year, month=bulk.month, days=days, note=f"Singolo per {target_user.employee_code}")
        else:
            raise ValueError(f"Formato '{suffix}' non supportato.")

        upload = Upload(
            uploaded_by=uploaded_by.id, company_name=uploaded_by.company_name or "",
            team_name=uploaded_by.team_name or "", original_filename=original_filename,
            stored_path=stored_path, file_type=suffix.lstrip("."), upload_kind="shifts",
            processing_status="processed", month_label=parsed.month_label, source_note=parsed.note, users_processed=1,
        )
        session.add(upload); session.commit(); session.refresh(upload)

        defs = session.exec(select(ShiftDefinition).where(ShiftDefinition.company_name == uploaded_by.company_name, ShiftDefinition.team_name == uploaded_by.team_name)).all()
        code_to_def = {d.code.upper(): d for d in defs}
        year = parsed.year or date.today().year
        month = parsed.month or date.today().month
        self._store_shifts_for_user(session, target_user, upload, parsed.days, code_to_def, year, month, standard_hours)
        return upload

    def bulk_import_team(self, session, manager, stored_path, original_filename, standard_hours=6.0, search_by="matricola"):
        path = Path(stored_path)
        suffix = path.suffix.lower()
        if suffix in IMAGE_SUFFIXES:
            raise ValueError("Bulk non supporta immagini. Usa 'Utente singolo' per immagini AI.")
        parser = BULK_PARSERS.get(suffix)
        if not parser:
            raise ValueError(f"Formato '{suffix}' non supportato.")

        parsed = parser(path, search_by, "shifts")
        result = BulkImportResult()
        result.month_label = parsed.month_label

        if not parsed.days_by_employee:
            raise ValueError("Nessuna riga valida trovata nel file. Controlla formato e impostazione 'Cerca per'.")

        upload = Upload(
            uploaded_by=manager.id, company_name=manager.company_name or "",
            team_name=manager.team_name or "", original_filename=original_filename,
            stored_path=stored_path, file_type=suffix.lstrip("."), upload_kind="shifts",
            processing_status="processed", month_label=parsed.month_label,
            source_note=f"Bulk: {len(parsed.days_by_employee)} righe trovate",
        )
        session.add(upload); session.commit(); session.refresh(upload)

        defs = session.exec(select(ShiftDefinition).where(ShiftDefinition.company_name == manager.company_name, ShiftDefinition.team_name == manager.team_name)).all()
        code_to_def = {d.code.upper(): d for d in defs}
        year = parsed.year or date.today().year
        month = parsed.month or date.today().month

        # Build lookup: key -> user
        all_users = session.exec(select(User).where(User.company_name == manager.company_name, User.team_name == manager.team_name, User.is_active == True)).all()
        if search_by == "matricola":
            user_map = {u.employee_code.upper(): u for u in all_users}
        else:
            user_map = {u.full_name.upper(): u for u in all_users}
            # Also try LAST_FIRST format
            for u in all_users:
                parts = u.full_name.upper().split()
                if len(parts) >= 2:
                    user_map[f"{parts[-1]} {' '.join(parts[:-1])}"] = u

        for emp_key, days in parsed.days_by_employee.items():
            user = user_map.get(emp_key.upper())
            if not user:
                result.skipped.append(emp_key); continue
            try:
                self._store_shifts_for_user(session, user, upload, days, code_to_def, year, month, standard_hours)
                result.processed.append(emp_key)
            except Exception as e:
                result.errors.append((emp_key, str(e)))

        upload.users_processed = len(result.processed)
        upload.users_skipped = len(result.skipped)
        upload.source_note = f"Bulk {parsed.month_label}: {len(result.processed)} importati, {len(result.skipped)} non trovati"
        session.add(upload); session.commit(); session.refresh(upload)
        return upload, result

    def bulk_import_stations(self, session, manager, stored_path, original_filename, search_by="matricola"):
        path = Path(stored_path)
        suffix = path.suffix.lower()
        parser = BULK_PARSERS.get(suffix)
        if not parser:
            raise ValueError(f"Formato '{suffix}' non supportato per postazioni.")

        parsed = parser(path, search_by, "stations")
        result = BulkImportResult()
        result.month_label = parsed.month_label

        upload = Upload(
            uploaded_by=manager.id, company_name=manager.company_name or "",
            team_name=manager.team_name or "", original_filename=original_filename,
            stored_path=stored_path, file_type=suffix.lstrip("."), upload_kind="stations",
            processing_status="processed", month_label=parsed.month_label,
            source_note=f"Postazioni bulk: {len(parsed.stations_by_employee)} righe",
        )
        session.add(upload); session.commit(); session.refresh(upload)

        # Get station definitions for label lookup
        station_defs = session.exec(select(WorkStationDefinition).where(WorkStationDefinition.company_name == manager.company_name, WorkStationDefinition.team_name == manager.team_name)).all()
        code_to_label = {d.code.upper(): d.label for d in station_defs}

        all_users = session.exec(select(User).where(User.company_name == manager.company_name, User.team_name == manager.team_name, User.is_active == True)).all()
        if search_by == "matricola":
            user_map = {u.employee_code.upper(): u for u in all_users}
        else:
            user_map = {u.full_name.upper(): u for u in all_users}
            for u in all_users:
                parts = u.full_name.upper().split()
                if len(parts) >= 2:
                    user_map[f"{parts[-1]} {' '.join(parts[:-1])}"] = u

        year = parsed.year or date.today().year
        month = parsed.month or date.today().month

        for emp_key, stations in parsed.stations_by_employee.items():
            user = user_map.get(emp_key.upper())
            if not user:
                result.skipped.append(emp_key); continue
            try:
                for day, station_code in stations.items():
                    try:
                        assigned_date = date(year, month, day)
                    except ValueError:
                        continue
                    existing = session.exec(select(WorkStationEntry).where(WorkStationEntry.user_id == user.id, WorkStationEntry.assigned_date == assigned_date)).first()
                    if existing:
                        existing.station_code = station_code.upper()
                        existing.station_label = code_to_label.get(station_code.upper())
                        existing.upload_id = upload.id
                        session.add(existing)
                    else:
                        session.add(WorkStationEntry(
                            user_id=user.id, upload_id=upload.id,
                            assigned_date=assigned_date, month_label=parsed.month_label,
                            station_code=station_code.upper(),
                            station_label=code_to_label.get(station_code.upper()),
                            validity="daily",
                        ))
                result.processed.append(emp_key)
            except Exception as e:
                result.errors.append((emp_key, str(e)))

        session.commit()
        upload.users_processed = len(result.processed)
        upload.users_skipped = len(result.skipped)
        session.add(upload); session.commit(); session.refresh(upload)
        return upload, result

    def _store_shifts_for_user(self, session, user, upload, days, code_to_def, year, month, standard_hours):
        for day, code in days.items():
            code_upper = code.upper()
            shift_def = code_to_def.get(code_upper)
            label = shift_def.label if shift_def else code_upper
            time_start = shift_def.time_start if shift_def else None
            time_end = shift_def.time_end if shift_def else None
            hours_worked = overtime_hours = None

            from app.utils.file_parsers import _is_shift_code
            from app.utils.overtime import parse_time_code
            time_result = parse_time_code(code_upper) if not shift_def else None
            if time_result:
                hours_worked, time_start, time_end = time_result
                label = f"{time_start}–{time_end}"
                overtime_hours = compute_overtime(hours_worked, standard_hours)
            elif shift_def and shift_def.time_start and shift_def.time_end:
                hw = hours_from_times(shift_def.time_start, shift_def.time_end)
                if hw is not None:
                    hours_worked = hw
                    overtime_hours = compute_overtime(hw, standard_hours)
            elif shift_def and shift_def.default_hours:
                hours_worked = shift_def.default_hours
                overtime_hours = compute_overtime(shift_def.default_hours, standard_hours)

            try:
                shift_date = date(year, month, day)
            except ValueError:
                continue

            existing = session.exec(select(ShiftEntry).where(ShiftEntry.user_id == user.id, ShiftEntry.shift_date == shift_date)).first()
            if existing:
                existing.shift_code = code_upper; existing.shift_label = label
                existing.upload_id = upload.id; existing.manually_edited = False
                existing.time_start = time_start; existing.time_end = time_end
                existing.hours_worked = hours_worked; existing.overtime_hours = overtime_hours
                session.add(existing)
            else:
                session.add(ShiftEntry(user_id=user.id, upload_id=upload.id, shift_date=shift_date, shift_code=code_upper, shift_label=label, time_start=time_start, time_end=time_end, hours_worked=hours_worked, overtime_hours=overtime_hours))
        session.commit()
