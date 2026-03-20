import json
from sqlmodel import Session, select
from app.models.entities import ShiftDefinition, ShiftEntry, Upload, User, TeamConfig, WorkStationEntry, WorkStationDefinition
from app.schemas.common import (
    DashboardResponse, DashboardSummary, ShiftDefinitionRead,
    ShiftEntryRead, UploadRead, UserRead, TeamConfigRead,
    WorkStationEntryRead, WorkStationDefinitionRead,
)


def build_dashboard(session: Session, user: User) -> DashboardResponse:
    shifts = session.exec(
        select(ShiftEntry).where(ShiftEntry.user_id == user.id).order_by(ShiftEntry.shift_date)
    ).all()

    uploads = session.exec(
        select(Upload).where(
            Upload.company_name == user.company_name,
            Upload.team_name == user.team_name,
        ).order_by(Upload.created_at.desc())
    ).all()

    definitions = session.exec(
        select(ShiftDefinition).where(
            ShiftDefinition.company_name == user.company_name,
            ShiftDefinition.team_name == user.team_name,
            ShiftDefinition.is_active == True,
        ).order_by(ShiftDefinition.sort_order)
    ).all()

    station_defs = session.exec(
        select(WorkStationDefinition).where(
            WorkStationDefinition.company_name == user.company_name,
            WorkStationDefinition.team_name == user.team_name,
            WorkStationDefinition.is_active == True,
        ).order_by(WorkStationDefinition.sort_order)
    ).all()

    stations = session.exec(
        select(WorkStationEntry).where(WorkStationEntry.user_id == user.id)
    ).all()

    team_config = session.exec(
        select(TeamConfig).where(
            TeamConfig.company_name == user.company_name,
            TeamConfig.team_name == user.team_name,
        )
    ).first()

    off_codes = {d.code for d in definitions if d.category == "off"}
    work_days = sum(1 for s in shifts if s.shift_code not in off_codes)
    off_days = sum(1 for s in shifts if s.shift_code in off_codes)
    total_hours = sum((s.hours_worked or 0.0) for s in shifts)
    total_overtime = sum((s.overtime_hours or 0.0) for s in shifts)
    by_code: dict = {}
    for s in shifts:
        by_code[s.shift_code] = by_code.get(s.shift_code, 0) + 1

    return DashboardResponse(
        user=UserRead.model_validate(user),
        summary=DashboardSummary(
            total_days=len(shifts),
            work_days=work_days,
            off_days=off_days,
            uploads_count=len(uploads),
            hours_worked=round(total_hours, 1),
            overtime_hours=round(total_overtime, 1),
            by_code=by_code,
        ),
        shifts=[ShiftEntryRead.model_validate(s) for s in shifts],
        uploads=[UploadRead.model_validate(u) for u in uploads],
        definitions=[ShiftDefinitionRead.model_validate(d) for d in definitions],
        station_definitions=[WorkStationDefinitionRead.model_validate(d) for d in station_defs],
        stations=[WorkStationEntryRead.model_validate(s) for s in stations],
        team_config=TeamConfigRead.model_validate(team_config) if team_config else None,
    )
