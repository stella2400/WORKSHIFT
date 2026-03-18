from sqlmodel import Session, select

from app.models.entities import ShiftDefinition, ShiftEntry, Upload, User
from app.schemas.common import DashboardResponse, DashboardSummary, ShiftDefinitionRead, ShiftEntryRead, UploadRead, UserRead


def build_dashboard(session: Session, user: User) -> DashboardResponse:
    shifts = session.exec(select(ShiftEntry).where(ShiftEntry.user_id == user.id).order_by(ShiftEntry.shift_date)).all()
    uploads = session.exec(select(Upload).where(Upload.user_id == user.id).order_by(Upload.created_at.desc())).all()
    definitions = session.exec(
        select(ShiftDefinition).where(ShiftDefinition.user_id == user.id, ShiftDefinition.is_active == True).order_by(ShiftDefinition.sort_order)
    ).all()

    off_codes = {item.code for item in definitions if item.category == "off"}
    work_days = sum(1 for item in shifts if item.shift_code not in off_codes)
    off_days = sum(1 for item in shifts if item.shift_code in off_codes)

    return DashboardResponse(
        user=UserRead.model_validate(user),
        summary=DashboardSummary(
            total_days=len(shifts),
            work_days=work_days,
            off_days=off_days,
            uploads_count=len(uploads),
        ),
        shifts=[ShiftEntryRead.model_validate(item) for item in shifts],
        uploads=[UploadRead.model_validate(item) for item in uploads],
        definitions=[ShiftDefinitionRead.model_validate(item) for item in definitions],
    )
