from __future__ import annotations

from datetime import date
from pathlib import Path

from sqlmodel import Session, select, delete

from app.models.entities import ShiftDefinition, ShiftEntry, Upload, User
from app.utils.file_parsers import parse_docx, parse_image_placeholder, parse_pdf, parse_xlsx

PARSERS = {
    ".xlsx": parse_xlsx,
    ".xlsm": parse_xlsx,
    ".docx": parse_docx,
    ".pdf": parse_pdf,
    ".png": parse_image_placeholder,
    ".jpg": parse_image_placeholder,
    ".jpeg": parse_image_placeholder,
    ".webp": parse_image_placeholder,
}


class ImportService:
    def parse_and_store(self, session: Session, user: User, image_path: str, original_filename: str) -> Upload:
        path = Path(image_path)
        suffix = path.suffix.lower()
        parser = PARSERS.get(suffix)
        if not parser:
            raise ValueError("Formato file non supportato")

        parsed = parser(path, user.employee_code)
        definitions = session.exec(select(ShiftDefinition).where(ShiftDefinition.user_id == user.id)).all()
        code_to_label = {item.code.upper(): item.label for item in definitions}

        upload = Upload(
            user_id=user.id,
            original_filename=original_filename,
            stored_path=str(path),
            file_type=suffix.lstrip("."),
            processing_status="processed",
            month_label=parsed.month_label,
            source_note=parsed.note,
        )
        session.add(upload)
        session.commit()
        session.refresh(upload)

        old_uploads = session.exec(
            select(Upload).where(Upload.user_id == user.id, Upload.month_label == upload.month_label, Upload.id != upload.id)
        ).all()
        old_ids = [item.id for item in old_uploads if item.id is not None]
        if old_ids:
            session.exec(delete(ShiftEntry).where(ShiftEntry.upload_id.in_(old_ids)))
            for item in old_uploads:
                session.delete(item)
            session.commit()

        year = 2026
        month = 1
        for name, idx in {
            "gennaio": 1, "febbraio": 2, "marzo": 3, "aprile": 4, "maggio": 5, "giugno": 6,
            "luglio": 7, "agosto": 8, "settembre": 9, "ottobre": 10, "novembre": 11, "dicembre": 12,
        }.items():
            if name in upload.month_label.lower():
                month = idx
                break

        for day, code in parsed.days.items():
            if code not in code_to_label:
                continue
            try:
                shift_date = date(year, month, day)
            except ValueError:
                continue
            session.add(
                ShiftEntry(
                    user_id=user.id,
                    upload_id=upload.id,
                    shift_date=shift_date,
                    shift_code=code,
                    shift_label=code_to_label[code],
                )
            )

        session.commit()
        return upload
