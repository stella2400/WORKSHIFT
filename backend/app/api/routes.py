from __future__ import annotations
import json, secrets, uuid
from datetime import datetime, timedelta, UTC
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.session import get_session
from app.models.entities import (
    Company, Team, TeamConfig, PasswordResetToken,
    ShiftDefinition, ShiftEntry, ShiftSwapRequest,
    Upload, User, WorkStationDefinition, WorkStationEntry,
)
from app.schemas.common import *
from app.services.auth import get_current_user, require_manager, require_admin
from app.services.dashboard import build_dashboard
from app.services.email_service import send_password_reset, send_swap_notification, send_temp_password
from app.services.importer import ImportService, BulkImportResult
from app.utils.shift_defaults import DEFAULT_SHIFT_DEFINITIONS
from app.utils.overtime import hours_from_times, compute_overtime

settings = get_settings()
router = APIRouter()
import_service = ImportService()
ALLOWED = {".xlsx",".xlsm",".docx",".pdf",".png",".jpg",".jpeg",".webp"}


def _std_hours(session, user):
    cfg = session.exec(select(TeamConfig).where(TeamConfig.company_name==user.company_name, TeamConfig.team_name==user.team_name)).first()
    return cfg.standard_hours if cfg else 6.0

def _search_by(session, user):
    cfg = session.exec(select(TeamConfig).where(TeamConfig.company_name==user.company_name, TeamConfig.team_name==user.team_name)).first()
    return cfg.search_by if cfg else "matricola"

def _enrich_swap(session, swap: ShiftSwapRequest) -> SwapDetailRead:
    req_user = session.exec(select(User).where(User.id==swap.requester_id)).first()
    tgt_user = session.exec(select(User).where(User.id==swap.target_id)).first()
    req_shift = session.exec(select(ShiftEntry).where(ShiftEntry.id==swap.requester_shift_id)).first()
    tgt_shift = session.exec(select(ShiftEntry).where(ShiftEntry.id==swap.target_shift_id)).first()
    return SwapDetailRead(
        id=swap.id, status=swap.status,
        requester_id=swap.requester_id,
        requester_name=req_user.full_name if req_user else "—",
        requester_employee_code=req_user.employee_code if req_user else "—",
        target_id=swap.target_id,
        target_name=tgt_user.full_name if tgt_user else "—",
        target_employee_code=tgt_user.employee_code if tgt_user else "—",
        requester_shift_date=req_shift.shift_date if req_shift else None,
        requester_shift_code=req_shift.shift_code if req_shift else "",
        requester_shift_label=req_shift.shift_label if req_shift else "",
        target_shift_date=tgt_shift.shift_date if tgt_shift else None,
        target_shift_code=tgt_shift.shift_code if tgt_shift else "",
        target_shift_label=tgt_shift.shift_label if tgt_shift else "",
        requester_note=swap.requester_note, target_note=swap.target_note,
        manager_note=swap.manager_note,
        created_at=swap.created_at, updated_at=swap.updated_at,
    )

async def _save_upload(file: UploadFile) -> Path:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED:
        raise HTTPException(status_code=400, detail=f"Formato '{suffix}' non supportato")
    uploads_dir = Path(settings.uploads_dir)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    p = uploads_dir / f"{uuid.uuid4().hex}{suffix}"
    p.write_bytes(await file.read())
    return p


# ── Auth ──────────────────────────────────────────────────────────────────────

@router.get("/auth/registration-open")
def registration_status():
    return {"open": settings.registration_open}

@router.post("/auth/register", response_model=AuthResponse)
def register(payload: RegisterRequest, session: Session = Depends(get_session)):
    if not settings.registration_open:
        raise HTTPException(status_code=403, detail="Registrazione disabilitata.")
    if session.exec(select(User).where(User.email==payload.email)).first():
        raise HTTPException(status_code=400, detail="Email già registrata")
    if session.exec(select(User).where(User.employee_code==payload.employee_code)).first():
        raise HTTPException(status_code=400, detail="Matricola già in uso")
    user = User(full_name=payload.full_name, employee_code=payload.employee_code, company_name=payload.company_name, team_name=payload.team_name, email=payload.email, password_hash=get_password_hash(payload.password), role="user")
    session.add(user); session.commit(); session.refresh(user)
    return AuthResponse(access_token=create_access_token(str(user.id)), user=UserRead.model_validate(user))

@router.post("/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email==payload.email)).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disattivato")
    return AuthResponse(access_token=create_access_token(str(user.id)), user=UserRead.model_validate(user))

@router.post("/auth/forgot-password")
def forgot_password(payload: ForgotPasswordRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email==payload.email, User.employee_code==payload.employee_code)).first()
    if not user: return {"message": "Se i dati sono corretti riceverai un'email."}
    for t in session.exec(select(PasswordResetToken).where(PasswordResetToken.user_id==user.id, PasswordResetToken.used==False)).all():
        t.used=True; session.add(t)
    token_str = secrets.token_urlsafe(32)
    session.add(PasswordResetToken(user_id=user.id, token=token_str, expires_at=datetime.now(UTC).replace(tzinfo=None)+timedelta(minutes=30)))
    session.commit()
    send_password_reset(user.email, user.full_name, f"{settings.frontend_url}/reset-password?token={token_str}")
    return {"message": "Se i dati sono corretti riceverai un'email."}

@router.post("/auth/reset-password")
def reset_password(payload: ResetPasswordRequest, session: Session = Depends(get_session)):
    rt = session.exec(select(PasswordResetToken).where(PasswordResetToken.token==payload.token, PasswordResetToken.used==False)).first()
    if not rt: raise HTTPException(status_code=400, detail="Token non valido")
    if rt.expires_at < datetime.utcnow(): raise HTTPException(status_code=400, detail="Token scaduto")
    user = session.exec(select(User).where(User.id==rt.user_id)).first()
    if not user: raise HTTPException(status_code=404, detail="Utente non trovato")
    user.password_hash=get_password_hash(payload.new_password); user.must_change_password=False; rt.used=True
    session.add(user); session.add(rt); session.commit()
    return {"message": "Password aggiornata"}

# ── Profile ───────────────────────────────────────────────────────────────────
@router.get("/users/me", response_model=UserRead)
def get_me(current_user=Depends(get_current_user)): return UserRead.model_validate(current_user)

@router.patch("/users/me", response_model=UserRead)
def update_profile(payload: UpdateProfileRequest, current_user=Depends(get_current_user), session: Session=Depends(get_session)):
    if payload.full_name is not None: current_user.full_name=payload.full_name
    if payload.company_name is not None: current_user.company_name=payload.company_name
    if payload.team_name is not None: current_user.team_name=payload.team_name
    if payload.email is not None:
        if session.exec(select(User).where(User.email==payload.email, User.id!=current_user.id)).first():
            raise HTTPException(status_code=400, detail="Email già in uso")
        current_user.email=payload.email
    session.add(current_user); session.commit(); session.refresh(current_user)
    return UserRead.model_validate(current_user)

@router.post("/users/me/change-password")
def change_password(payload: ChangePasswordRequest, current_user=Depends(get_current_user), session: Session=Depends(get_session)):
    if not verify_password(payload.current_password, current_user.password_hash):
        raise HTTPException(status_code=400, detail="Password attuale non corretta")
    current_user.password_hash=get_password_hash(payload.new_password); current_user.must_change_password=False
    session.add(current_user); session.commit()
    return {"message": "Password aggiornata"}

@router.put("/users/me/dashboard-config")
def update_dashboard_config(payload: UpdateDashboardConfigRequest, current_user=Depends(get_current_user), session: Session=Depends(get_session)):
    if len(payload.cards)>4: raise HTTPException(status_code=400, detail="Massimo 4 card")
    current_user.dashboard_config=json.dumps([c.model_dump() for c in payload.cards])
    session.add(current_user); session.commit()
    return {"message": "OK"}

# ── Dashboard ─────────────────────────────────────────────────────────────────
@router.get("/dashboard/me", response_model=DashboardResponse)
def dashboard(current_user=Depends(get_current_user), session: Session=Depends(get_session)):
    if current_user.role=="admin": raise HTTPException(status_code=403, detail="Admin usa il pannello admin")
    return build_dashboard(session, current_user)

# ── Shift definitions ─────────────────────────────────────────────────────────
@router.get("/settings/shifts", response_model=list[ShiftDefinitionRead])
def get_shift_settings(current_user=Depends(get_current_user), session: Session=Depends(get_session)):
    if current_user.role=="admin": raise HTTPException(status_code=403, detail="Admin non ha turni")
    return [ShiftDefinitionRead.model_validate(i) for i in session.exec(select(ShiftDefinition).where(ShiftDefinition.company_name==current_user.company_name, ShiftDefinition.team_name==current_user.team_name).order_by(ShiftDefinition.sort_order)).all()]

@router.put("/settings/shifts", response_model=list[ShiftDefinitionRead])
def replace_shift_settings(payload: list[ShiftDefinitionCreate], manager=Depends(require_manager), session: Session=Depends(get_session)):
    for old in session.exec(select(ShiftDefinition).where(ShiftDefinition.company_name==manager.company_name, ShiftDefinition.team_name==manager.team_name)).all(): session.delete(old)
    session.commit()
    for idx, item in enumerate(payload):
        d=item.model_dump(); d["sort_order"]=idx
        session.add(ShiftDefinition(company_name=manager.company_name or "", team_name=manager.team_name or "", **d))
    session.commit()
    return [ShiftDefinitionRead.model_validate(i) for i in session.exec(select(ShiftDefinition).where(ShiftDefinition.company_name==manager.company_name, ShiftDefinition.team_name==manager.team_name).order_by(ShiftDefinition.sort_order)).all()]

# ── Workstation definitions ───────────────────────────────────────────────────
@router.get("/settings/stations", response_model=list[WorkStationDefinitionRead])
def get_station_defs(current_user=Depends(get_current_user), session: Session=Depends(get_session)):
    if current_user.role=="admin": return []
    return [WorkStationDefinitionRead.model_validate(i) for i in session.exec(select(WorkStationDefinition).where(WorkStationDefinition.company_name==current_user.company_name, WorkStationDefinition.team_name==current_user.team_name).order_by(WorkStationDefinition.sort_order)).all()]

@router.put("/settings/stations", response_model=list[WorkStationDefinitionRead])
def replace_station_defs(payload: list[WorkStationDefinitionCreate], manager=Depends(require_manager), session: Session=Depends(get_session)):
    for old in session.exec(select(WorkStationDefinition).where(WorkStationDefinition.company_name==manager.company_name, WorkStationDefinition.team_name==manager.team_name)).all(): session.delete(old)
    session.commit()
    for idx, item in enumerate(payload):
        d=item.model_dump(); d["sort_order"]=idx
        session.add(WorkStationDefinition(company_name=manager.company_name or "", team_name=manager.team_name or "", **d))
    session.commit()
    return [WorkStationDefinitionRead.model_validate(i) for i in session.exec(select(WorkStationDefinition).where(WorkStationDefinition.company_name==manager.company_name, WorkStationDefinition.team_name==manager.team_name).order_by(WorkStationDefinition.sort_order)).all()]

# ── Team config ───────────────────────────────────────────────────────────────
@router.get("/settings/team-config", response_model=TeamConfigRead)
def get_team_config(current_user=Depends(get_current_user), session: Session=Depends(get_session)):
    cfg=session.exec(select(TeamConfig).where(TeamConfig.company_name==current_user.company_name, TeamConfig.team_name==current_user.team_name)).first()
    if not cfg:
        cfg=TeamConfig(company_name=current_user.company_name or "", team_name=current_user.team_name or ""); session.add(cfg); session.commit(); session.refresh(cfg)
    return TeamConfigRead.model_validate(cfg)

@router.put("/settings/team-config", response_model=TeamConfigRead)
def update_team_config(payload: TeamConfigUpdate, manager=Depends(require_manager), session: Session=Depends(get_session)):
    cfg=session.exec(select(TeamConfig).where(TeamConfig.company_name==manager.company_name, TeamConfig.team_name==manager.team_name)).first()
    if not cfg: cfg=TeamConfig(company_name=manager.company_name or "", team_name=manager.team_name or "")
    cfg.standard_hours=payload.standard_hours; cfg.search_by=payload.search_by; cfg.updated_at=datetime.utcnow()
    session.add(cfg); session.commit(); session.refresh(cfg)
    return TeamConfigRead.model_validate(cfg)

# ── Shifts ────────────────────────────────────────────────────────────────────
@router.patch("/shifts/{shift_id}", response_model=ShiftEntryRead)
def update_shift(shift_id:int, payload: ShiftEntryUpdate, current_user=Depends(get_current_user), session: Session=Depends(get_session)):
    shift=session.exec(select(ShiftEntry).where(ShiftEntry.id==shift_id)).first()
    if not shift: raise HTTPException(status_code=404, detail="Turno non trovato")
    if shift.user_id!=current_user.id and current_user.role not in ("manager","admin"): raise HTTPException(status_code=403)
    shift.shift_code=payload.shift_code.upper(); shift.shift_label=payload.shift_label; shift.notes=payload.notes; shift.manually_edited=True
    if payload.actual_time_start is None and payload.actual_time_end is None:
        # Both explicitly None → clear actual times, revert to planned
        shift.actual_time_start=None; shift.actual_time_end=None
        if shift.time_start and shift.time_end:
            hw=hours_from_times(shift.time_start, shift.time_end)
            if hw: std=_std_hours(session, current_user); shift.hours_worked=hw; shift.overtime_hours=compute_overtime(hw, std)
    else:
        # At least one side provided — use planned as fallback for missing side
        eff_start = payload.actual_time_start or shift.time_start
        eff_end   = payload.actual_time_end   or shift.time_end
        if eff_start and eff_end:
            shift.actual_time_start=eff_start; shift.actual_time_end=eff_end
            hw=hours_from_times(eff_start, eff_end)
            if hw:
                std=_std_hours(session, current_user); shift.hours_worked=hw; shift.overtime_hours=compute_overtime(hw, std)
        if shift.time_start and shift.time_end:
            hw=hours_from_times(shift.time_start, shift.time_end)
            if hw: std=_std_hours(session, current_user); shift.hours_worked=hw; shift.overtime_hours=compute_overtime(hw, std)
    shift.updated_at=datetime.utcnow(); session.add(shift); session.commit(); session.refresh(shift)
    return ShiftEntryRead.model_validate(shift)

@router.delete("/shifts/{shift_id}")
def delete_shift(shift_id:int, current_user=Depends(get_current_user), session: Session=Depends(get_session)):
    shift=session.exec(select(ShiftEntry).where(ShiftEntry.id==shift_id)).first()
    if not shift: raise HTTPException(status_code=404, detail="Turno non trovato")
    if shift.user_id!=current_user.id and current_user.role not in ("manager","admin"): raise HTTPException(status_code=403)
    session.delete(shift); session.commit()
    return {"message":"Turno eliminato"}

def _save_station(session, user_id: int, shift_date, station_code, manager):
    """Save or update workstation entry for a user on a given date."""
    if not station_code:
        return
    from app.models.entities import WorkStationDefinition
    station_def = session.exec(
        select(WorkStationDefinition).where(
            WorkStationDefinition.code == station_code.upper(),
            WorkStationDefinition.company_name == manager.company_name,
            WorkStationDefinition.team_name == manager.team_name,
        )
    ).first()
    label = station_def.label if station_def else None
    existing_ws = session.exec(
        select(WorkStationEntry).where(WorkStationEntry.user_id == user_id, WorkStationEntry.assigned_date == shift_date)
    ).first()
    if existing_ws:
        existing_ws.station_code = station_code.upper()
        existing_ws.station_label = label
        session.add(existing_ws)
    else:
        session.add(WorkStationEntry(user_id=user_id, assigned_date=shift_date, station_code=station_code.upper(), station_label=label, validity="daily"))
    session.commit()


@router.patch("/shifts/{shift_id}/station")
def update_shift_station(shift_id: int, station_code: str, manager=Depends(require_manager), session: Session=Depends(get_session)):
    """Update/set the workstation for a specific shift entry."""
    shift = session.exec(select(ShiftEntry).where(ShiftEntry.id == shift_id)).first()
    if not shift: raise HTTPException(status_code=404, detail="Turno non trovato")
    from app.models.entities import WorkStationDefinition
    station_def = session.exec(
        select(WorkStationDefinition).where(
            WorkStationDefinition.code == station_code.upper(),
            WorkStationDefinition.company_name == manager.company_name,
            WorkStationDefinition.team_name == manager.team_name,
        )
    ).first()
    label = station_def.label if station_def else None
    existing_ws = session.exec(
        select(WorkStationEntry).where(WorkStationEntry.user_id == shift.user_id, WorkStationEntry.assigned_date == shift.shift_date)
    ).first()
    if existing_ws:
        existing_ws.station_code = station_code.upper()
        existing_ws.station_label = label
        session.add(existing_ws)
    else:
        session.add(WorkStationEntry(user_id=shift.user_id, assigned_date=shift.shift_date, station_code=station_code.upper(), station_label=label, validity="daily"))
    session.commit()
    return {"message": "Postazione aggiornata", "station_code": station_code.upper(), "station_label": label}


@router.post("/shifts/manual", response_model=ShiftEntryRead)
def create_manual_shift(payload: ManualShiftEntry, manager=Depends(require_manager), session: Session=Depends(get_session)):
    target=session.exec(select(User).where(User.id==payload.user_id)).first()
    if not target: raise HTTPException(status_code=404)
    if target.company_name!=manager.company_name or target.team_name!=manager.team_name: raise HTTPException(status_code=403)
    std=_std_hours(session, manager)
    hw=ot=None
    if payload.time_start and payload.time_end:
        hw=hours_from_times(payload.time_start, payload.time_end)
        if hw: ot=compute_overtime(hw, std)
    existing=session.exec(select(ShiftEntry).where(ShiftEntry.user_id==payload.user_id, ShiftEntry.shift_date==payload.shift_date)).first()
    if existing:
        existing.shift_code=payload.shift_code.upper(); existing.shift_label=payload.shift_label
        existing.time_start=payload.time_start; existing.time_end=payload.time_end
        existing.hours_worked=hw; existing.overtime_hours=ot; existing.notes=payload.notes; existing.manually_edited=True
        existing.updated_at=datetime.utcnow(); session.add(existing); session.commit(); session.refresh(existing)
        _save_station(session, payload.user_id, payload.shift_date, payload.station_code, manager)
        return ShiftEntryRead.model_validate(existing)
    entry=ShiftEntry(user_id=payload.user_id, shift_date=payload.shift_date, shift_code=payload.shift_code.upper(), shift_label=payload.shift_label, time_start=payload.time_start, time_end=payload.time_end, hours_worked=hw, overtime_hours=ot, notes=payload.notes, manually_edited=True)
    session.add(entry); session.commit(); session.refresh(entry)
    _save_station(session, payload.user_id, payload.shift_date, payload.station_code, manager)
    return ShiftEntryRead.model_validate(entry)

@router.get("/shifts/colleagues", response_model=list[ColleagueRead])
def get_colleagues(shift_date:str, shift_code:str, current_user=Depends(get_current_user), session: Session=Depends(get_session)):
    from datetime import date as date_type
    try: d=date_type.fromisoformat(shift_date)
    except ValueError: raise HTTPException(status_code=400)
    teammates=session.exec(select(User).where(User.company_name==current_user.company_name, User.team_name==current_user.team_name, User.is_active==True, User.id!=current_user.id)).all()
    result=[]
    for u in teammates:
        shift=session.exec(select(ShiftEntry).where(ShiftEntry.user_id==u.id, ShiftEntry.shift_date==d, ShiftEntry.shift_code==shift_code.upper())).first()
        if shift:
            ws=session.exec(select(WorkStationEntry).where(WorkStationEntry.user_id==u.id, WorkStationEntry.assigned_date==d)).first()
            result.append(ColleagueRead(id=u.id, full_name=u.full_name, employee_code=u.employee_code, shift_code=shift.shift_code, shift_label=shift.shift_label, station_name=ws.station_code if ws else None))
    return result

# ── Workstations user ─────────────────────────────────────────────────────────
@router.get("/workstations/me", response_model=list[WorkStationEntryRead])
def get_my_stations(current_user=Depends(get_current_user), session: Session=Depends(get_session)):
    return [WorkStationEntryRead.model_validate(i) for i in session.exec(select(WorkStationEntry).where(WorkStationEntry.user_id==current_user.id)).all()]

@router.get("/workstations/user/{user_id}", response_model=list[WorkStationEntryRead])
def get_user_stations(user_id: int, manager=Depends(require_manager), session: Session=Depends(get_session)):
    target=session.exec(select(User).where(User.id==user_id)).first()
    if not target: raise HTTPException(status_code=404)
    if target.company_name!=manager.company_name or target.team_name!=manager.team_name: raise HTTPException(status_code=403)
    return [WorkStationEntryRead.model_validate(i) for i in session.exec(select(WorkStationEntry).where(WorkStationEntry.user_id==user_id)).all()]

# ── Imports ───────────────────────────────────────────────────────────────────
@router.post("/imports/team", response_model=BulkImportResponse)
async def bulk_import(file: UploadFile=File(...), manager=Depends(require_manager), session: Session=Depends(get_session)):
    p=await _save_upload(file)
    std=_std_hours(session, manager); sb=_search_by(session, manager)
    try:
        upload, result=import_service.bulk_import_team(session, manager, str(p), file.filename or p.name, std, sb)
    except ValueError as exc: p.unlink(missing_ok=True); raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc: p.unlink(missing_ok=True); raise HTTPException(status_code=500, detail=str(exc))
    return BulkImportResponse(upload=UploadRead.model_validate(upload), processed=result.processed, skipped=result.skipped, errors=[[e[0],e[1]] for e in result.errors], month_label=result.month_label)

@router.post("/imports/user/{user_id}", response_model=UploadRead)
async def import_single_user(user_id:int, file: UploadFile=File(...), manager=Depends(require_manager), session: Session=Depends(get_session)):
    target=session.exec(select(User).where(User.id==user_id)).first()
    if not target: raise HTTPException(status_code=404)
    if target.company_name!=manager.company_name or target.team_name!=manager.team_name: raise HTTPException(status_code=403)
    p=await _save_upload(file); std=_std_hours(session, manager)
    try: upload=import_service.single_user_import(session, target, manager, str(p), file.filename or p.name, std)
    except ValueError as exc: p.unlink(missing_ok=True); raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc: p.unlink(missing_ok=True); raise HTTPException(status_code=500, detail=str(exc))
    return UploadRead.model_validate(upload)

@router.post("/imports/stations", response_model=BulkImportResponse)
async def import_stations(file: UploadFile=File(...), manager=Depends(require_manager), session: Session=Depends(get_session)):
    p=await _save_upload(file); sb=_search_by(session, manager)
    try: upload, result=import_service.bulk_import_stations(session, manager, str(p), file.filename or p.name, sb)
    except ValueError as exc: p.unlink(missing_ok=True); raise HTTPException(status_code=422, detail=str(exc))
    except Exception as exc: p.unlink(missing_ok=True); raise HTTPException(status_code=500, detail=str(exc))
    return BulkImportResponse(upload=UploadRead.model_validate(upload), processed=result.processed, skipped=result.skipped, errors=[[e[0],e[1]] for e in result.errors], month_label=result.month_label)

# ── Manager team ──────────────────────────────────────────────────────────────
@router.get("/manager/team", response_model=list[UserReadShort])
def get_team(manager=Depends(require_manager), session: Session=Depends(get_session)):
    return [UserReadShort.model_validate(u) for u in session.exec(select(User).where(User.company_name==manager.company_name, User.team_name==manager.team_name, User.is_active==True)).all()]

@router.get("/manager/team/shifts", response_model=list[TeamMemberShifts])
def get_team_shifts(manager=Depends(require_manager), session: Session=Depends(get_session)):
    users=session.exec(select(User).where(User.company_name==manager.company_name, User.team_name==manager.team_name, User.is_active==True)).all()
    return [TeamMemberShifts(user=UserReadShort.model_validate(u), shifts=[ShiftEntryRead.model_validate(s) for s in session.exec(select(ShiftEntry).where(ShiftEntry.user_id==u.id).order_by(ShiftEntry.shift_date)).all()]) for u in users]

@router.get("/manager/uploads", response_model=list[UploadRead])
def get_team_uploads(manager=Depends(require_manager), session: Session=Depends(get_session)):
    return [UploadRead.model_validate(u) for u in session.exec(select(Upload).where(Upload.company_name==manager.company_name, Upload.team_name==manager.team_name).order_by(Upload.created_at.desc())).all()]

# ── Team routes for users (swap) ──────────────────────────────────────────────
@router.get("/team/colleagues", response_model=list[UserReadShort])
def get_colleagues_list(current_user=Depends(get_current_user), session: Session=Depends(get_session)):
    if current_user.role=="admin": return []
    return [UserReadShort.model_validate(u) for u in session.exec(select(User).where(User.company_name==current_user.company_name, User.team_name==current_user.team_name, User.is_active==True, User.id!=current_user.id, User.role!="admin")).all()]

@router.get("/team/colleague-shifts/{user_id}", response_model=list[ShiftEntryRead])
def get_colleague_shifts(user_id:int, current_user=Depends(get_current_user), session: Session=Depends(get_session)):
    target=session.exec(select(User).where(User.id==user_id)).first()
    if not target: raise HTTPException(status_code=404)
    if target.company_name!=current_user.company_name or target.team_name!=current_user.team_name: raise HTTPException(status_code=403)
    return [ShiftEntryRead.model_validate(s) for s in session.exec(select(ShiftEntry).where(ShiftEntry.user_id==user_id).order_by(ShiftEntry.shift_date)).all()]

# ── Swaps ─────────────────────────────────────────────────────────────────────
@router.post("/swaps", response_model=SwapDetailRead)
def create_swap(payload: SwapRequestCreate, current_user=Depends(get_current_user), session: Session=Depends(get_session)):
    req_shift=session.exec(select(ShiftEntry).where(ShiftEntry.id==payload.requester_shift_id, ShiftEntry.user_id==current_user.id)).first()
    if not req_shift: raise HTTPException(status_code=404, detail="Turno richiedente non trovato")
    tgt_user=session.exec(select(User).where(User.id==payload.target_id)).first()
    if not tgt_user: raise HTTPException(status_code=404)
    if tgt_user.company_name!=current_user.company_name or tgt_user.team_name!=current_user.team_name: raise HTTPException(status_code=403, detail="Cambio solo tra colleghi dello stesso team")
    tgt_shift=session.exec(select(ShiftEntry).where(ShiftEntry.id==payload.target_shift_id, ShiftEntry.user_id==payload.target_id)).first()
    if not tgt_shift: raise HTTPException(status_code=404, detail="Turno destinatario non trovato")
    if session.exec(select(ShiftSwapRequest).where(ShiftSwapRequest.requester_shift_id==payload.requester_shift_id, ShiftSwapRequest.status.in_(["pending_target","pending_manager"]))).first():
        raise HTTPException(status_code=400, detail="Esiste già una richiesta aperta per questo turno")
    swap=ShiftSwapRequest(requester_id=current_user.id, target_id=payload.target_id, requester_shift_id=payload.requester_shift_id, target_shift_id=payload.target_shift_id, status="pending_target", requester_note=payload.requester_note)
    session.add(swap); session.commit(); session.refresh(swap)
    details = (f"{current_user.full_name} ({current_user.employee_code}) vuole scambiare il turno del "
               f"{req_shift.shift_date.strftime('%d/%m')} [{req_shift.shift_code} - {req_shift.shift_label}] "
               f"con il tuo del {tgt_shift.shift_date.strftime('%d/%m')} [{tgt_shift.shift_code} - {tgt_shift.shift_label}].")
    send_swap_notification(tgt_user.email, tgt_user.full_name, "new_request", details, settings.frontend_url)
    return _enrich_swap(session, swap)

@router.get("/swaps", response_model=list[SwapDetailRead])
def list_swaps(current_user=Depends(get_current_user), session: Session=Depends(get_session)):
    swaps=session.exec(select(ShiftSwapRequest).where((ShiftSwapRequest.requester_id==current_user.id)|(ShiftSwapRequest.target_id==current_user.id)).order_by(ShiftSwapRequest.created_at.desc())).all()
    return [_enrich_swap(session, s) for s in swaps]

@router.get("/swaps/pending-manager", response_model=list[SwapDetailRead])
def pending_manager(manager=Depends(require_manager), session: Session=Depends(get_session)):
    swaps=session.exec(select(ShiftSwapRequest).where(ShiftSwapRequest.status=="pending_manager")).all()
    return [_enrich_swap(session, s) for s in swaps]

@router.post("/swaps/{swap_id}/target-action", response_model=SwapDetailRead)
def target_action(swap_id:int, payload: SwapRequestAction, current_user=Depends(get_current_user), session: Session=Depends(get_session)):
    swap=session.exec(select(ShiftSwapRequest).where(ShiftSwapRequest.id==swap_id)).first()
    if not swap or swap.target_id!=current_user.id: raise HTTPException(status_code=404)
    if swap.status!="pending_target": raise HTTPException(status_code=400, detail=f"Stato attuale: '{swap.status}'")
    req_user=session.exec(select(User).where(User.id==swap.requester_id)).first()
    req_shift=session.exec(select(ShiftEntry).where(ShiftEntry.id==swap.requester_shift_id)).first()
    tgt_shift=session.exec(select(ShiftEntry).where(ShiftEntry.id==swap.target_shift_id)).first()
    if payload.action=="accept":
        swap.status="pending_manager"; swap.target_note=payload.note
        if req_user and req_shift and tgt_shift:
            details=(f"{current_user.full_name} ha accettato lo scambio: "
                     f"{req_shift.shift_date.strftime('%d/%m')} [{req_shift.shift_code}] ↔ {tgt_shift.shift_date.strftime('%d/%m')} [{tgt_shift.shift_code}]. "
                     f"In attesa dell'approvazione del manager.")
            send_swap_notification(req_user.email, req_user.full_name, "accepted_target", details, settings.frontend_url)
    elif payload.action=="reject":
        swap.status="rejected"; swap.target_note=payload.note
        if req_user and req_shift and tgt_shift:
            details=f"{current_user.full_name} ha rifiutato la richiesta di scambio del {req_shift.shift_date.strftime('%d/%m')}."
            send_swap_notification(req_user.email, req_user.full_name, "rejected_target", details, settings.frontend_url)
    else: raise HTTPException(status_code=400, detail="Usa 'accept' o 'reject'")
    swap.updated_at=datetime.utcnow(); session.add(swap); session.commit(); session.refresh(swap)
    return _enrich_swap(session, swap)

@router.post("/swaps/{swap_id}/manager-action", response_model=SwapDetailRead)
def manager_action(swap_id:int, payload: SwapRequestAction, manager=Depends(require_manager), session: Session=Depends(get_session)):
    swap=session.exec(select(ShiftSwapRequest).where(ShiftSwapRequest.id==swap_id)).first()
    if not swap: raise HTTPException(status_code=404)
    if swap.status!="pending_manager": raise HTTPException(status_code=400, detail=f"Stato: '{swap.status}'")
    req_user=session.exec(select(User).where(User.id==swap.requester_id)).first()
    tgt_user=session.exec(select(User).where(User.id==swap.target_id)).first()
    if payload.action=="approve":
        rs=session.exec(select(ShiftEntry).where(ShiftEntry.id==swap.requester_shift_id)).first()
        ts_=session.exec(select(ShiftEntry).where(ShiftEntry.id==swap.target_shift_id)).first()
        if rs and ts_:
            rs.shift_code,ts_.shift_code=ts_.shift_code,rs.shift_code
            rs.shift_label,ts_.shift_label=ts_.shift_label,rs.shift_label
            rs.time_start,ts_.time_start=ts_.time_start,rs.time_start
            rs.time_end,ts_.time_end=ts_.time_end,rs.time_end
            rs.hours_worked,ts_.hours_worked=ts_.hours_worked,rs.hours_worked
            rs.overtime_hours,ts_.overtime_hours=ts_.overtime_hours,rs.overtime_hours
            rs.manually_edited=ts_.manually_edited=True
            rs.updated_at=ts_.updated_at=datetime.utcnow()
            session.add(rs); session.add(ts_)
        swap.status="approved"; swap.manager_note=payload.note
        for u in [req_user,tgt_user]:
            if u: send_swap_notification(u.email, u.full_name, "approved_manager", f"Il cambio turno è stato approvato dal manager. {payload.note or ''}", settings.frontend_url)
    elif payload.action=="reject":
        swap.status="rejected"; swap.manager_note=payload.note
        for u in [req_user,tgt_user]:
            if u: send_swap_notification(u.email, u.full_name, "rejected_manager", f"Il cambio turno non è stato approvato. {payload.note or ''}", settings.frontend_url)
    else: raise HTTPException(status_code=400)
    swap.updated_at=datetime.utcnow(); session.add(swap); session.commit(); session.refresh(swap)
    return _enrich_swap(session, swap)

# ── Admin ─────────────────────────────────────────────────────────────────────
@router.get("/admin/companies", response_model=list[CompanyRead])
def list_companies(admin=Depends(require_admin), session: Session=Depends(get_session)):
    return [CompanyRead.model_validate(c) for c in session.exec(select(Company)).all()]

@router.post("/admin/companies", response_model=CompanyRead)
def create_company(payload: CompanyCreate, admin=Depends(require_admin), session: Session=Depends(get_session)):
    if session.exec(select(Company).where(Company.name==payload.name)).first(): raise HTTPException(status_code=400, detail="Esiste già")
    c=Company(name=payload.name, description=payload.description, created_by=admin.id); session.add(c); session.commit(); session.refresh(c)
    return CompanyRead.model_validate(c)

@router.delete("/admin/companies/{company_id}")
def delete_company(company_id:int, admin=Depends(require_admin), session: Session=Depends(get_session)):
    c=session.exec(select(Company).where(Company.id==company_id)).first()
    if not c: raise HTTPException(status_code=404)
    session.delete(c); session.commit(); return {"message":"Eliminata"}

@router.get("/admin/teams", response_model=list[TeamRead])
def list_teams(admin=Depends(require_admin), session: Session=Depends(get_session)):
    return [TeamRead.model_validate(t) for t in session.exec(select(Team)).all()]

@router.post("/admin/teams", response_model=TeamRead)
def create_team(payload: TeamCreate, admin=Depends(require_admin), session: Session=Depends(get_session)):
    company=session.exec(select(Company).where(Company.id==payload.company_id)).first()
    if not company: raise HTTPException(status_code=404)
    t=Team(name=payload.name, description=payload.description, company_id=payload.company_id, created_by=admin.id)
    session.add(t); session.commit(); session.refresh(t)
    for item in DEFAULT_SHIFT_DEFINITIONS:
        session.add(ShiftDefinition(company_name=company.name, team_name=t.name, **item))
    session.add(TeamConfig(company_name=company.name, team_name=t.name, standard_hours=6.0))
    session.commit(); return TeamRead.model_validate(t)

@router.delete("/admin/teams/{team_id}")
def delete_team(team_id:int, admin=Depends(require_admin), session: Session=Depends(get_session)):
    t=session.exec(select(Team).where(Team.id==team_id)).first()
    if not t: raise HTTPException(status_code=404)
    session.delete(t); session.commit(); return {"message":"Eliminato"}

@router.get("/admin/users", response_model=list[UserRead])
def list_users(admin=Depends(require_admin), session: Session=Depends(get_session)):
    return [UserRead.model_validate(u) for u in session.exec(select(User).where(User.role!="admin")).all()]

@router.post("/admin/users", response_model=UserRead)
def create_user(payload: RegisterRequest, admin=Depends(require_admin), session: Session=Depends(get_session)):
    if session.exec(select(User).where(User.email==payload.email)).first(): raise HTTPException(status_code=400, detail="Email già registrata")
    if session.exec(select(User).where(User.employee_code==payload.employee_code, User.company_name==payload.company_name)).first(): raise HTTPException(status_code=400, detail="Matricola già in uso in questa azienda")
    user=User(full_name=payload.full_name, employee_code=payload.employee_code, company_name=payload.company_name, team_name=payload.team_name, email=payload.email, password_hash=get_password_hash(payload.password), role=payload.role or "user", must_change_password=True)
    session.add(user); session.commit(); session.refresh(user)
    send_temp_password(user.email, user.full_name, payload.password, settings.frontend_url)
    return UserRead.model_validate(user)

@router.put("/admin/users/{user_id}", response_model=UserRead)
def update_user(user_id:int, payload: RegisterRequest, admin=Depends(require_admin), session: Session=Depends(get_session)):
    user=session.exec(select(User).where(User.id==user_id)).first()
    if not user: raise HTTPException(status_code=404)
    user.full_name=payload.full_name; user.employee_code=payload.employee_code; user.email=payload.email
    user.company_name=payload.company_name; user.team_name=payload.team_name; user.role=payload.role or user.role
    session.add(user); session.commit(); session.refresh(user); return UserRead.model_validate(user)

@router.post("/admin/users/{user_id}/reset-password")
def admin_reset_pw(user_id:int, payload: AdminResetPasswordRequest, admin=Depends(require_admin), session: Session=Depends(get_session)):
    user=session.exec(select(User).where(User.id==user_id)).first()
    if not user: raise HTTPException(status_code=404)
    user.password_hash=get_password_hash(payload.new_password); user.must_change_password=True
    session.add(user); session.commit()
    send_temp_password(user.email, user.full_name, payload.new_password, settings.frontend_url)
    return {"message":"Password reimpostata"}

@router.delete("/admin/users/{user_id}")
def delete_user(user_id:int, admin=Depends(require_admin), session: Session=Depends(get_session)):
    user=session.exec(select(User).where(User.id==user_id)).first()
    if not user: raise HTTPException(status_code=404)
    session.delete(user); session.commit(); return {"message":"Eliminato"}

@router.post("/admin/users/{user_id}/deactivate")
def deactivate_user(user_id:int, admin=Depends(require_admin), session: Session=Depends(get_session)):
    user=session.exec(select(User).where(User.id==user_id)).first()
    if not user: raise HTTPException(status_code=404)
    user.is_active=False; session.add(user); session.commit(); return {"message":"Disattivato"}

@router.post("/admin/users/{user_id}/activate")
def activate_user(user_id:int, admin=Depends(require_admin), session: Session=Depends(get_session)):
    user=session.exec(select(User).where(User.id==user_id)).first()
    if not user: raise HTTPException(status_code=404)
    user.is_active=True; session.add(user); session.commit(); return {"message":"Attivato"}

@router.get("/health")
def health(): return {"status":"ok","version":"7.0.0"}
