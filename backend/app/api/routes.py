from pathlib import Path
import uuid

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlmodel import Session, select

from app.core.config import get_settings
from app.core.security import create_access_token, get_password_hash, verify_password
from app.db.session import get_session
from app.models.entities import ShiftDefinition, ShiftEntry, User
from app.schemas.common import (
    AuthResponse,
    DashboardResponse,
    LoginRequest,
    RegisterRequest,
    ShiftDefinitionCreate,
    ShiftDefinitionRead,
    ShiftEntryRead,
    ShiftEntryUpdate,
    UploadRead,
    UserRead,
)
from app.services.auth import get_current_user
from app.services.dashboard import build_dashboard
from app.services.importer import ImportService
from app.utils.shift_defaults import DEFAULT_SHIFT_DEFINITIONS

settings = get_settings()
router = APIRouter()
import_service = ImportService()


@router.post("/auth/register", response_model=AuthResponse)
def register(payload: RegisterRequest, session: Session = Depends(get_session)):
    existing = session.exec(select(User).where(User.email == payload.email)).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email già registrata")

    user = User(
        full_name=payload.full_name,
        employee_code=payload.employee_code,
        company_name=payload.company_name,
        team_name=payload.team_name,
        email=payload.email,
        password_hash=get_password_hash(payload.password),
    )
    session.add(user)
    session.commit()
    session.refresh(user)

    for item in DEFAULT_SHIFT_DEFINITIONS:
        session.add(ShiftDefinition(user_id=user.id, **item))
    session.commit()

    return AuthResponse(access_token=create_access_token(str(user.id)), user=UserRead.model_validate(user))


@router.post("/auth/login", response_model=AuthResponse)
def login(payload: LoginRequest, session: Session = Depends(get_session)):
    user = session.exec(select(User).where(User.email == payload.email)).first()
    if not user or not verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Credenziali non valide")
    return AuthResponse(access_token=create_access_token(str(user.id)), user=UserRead.model_validate(user))


@router.get("/dashboard/me", response_model=DashboardResponse)
def dashboard(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    return build_dashboard(session, current_user)


@router.get("/settings/shifts", response_model=list[ShiftDefinitionRead])
def get_shift_settings(current_user: User = Depends(get_current_user), session: Session = Depends(get_session)):
    items = session.exec(select(ShiftDefinition).where(ShiftDefinition.user_id == current_user.id).order_by(ShiftDefinition.sort_order)).all()
    return [ShiftDefinitionRead.model_validate(item) for item in items]


@router.put("/settings/shifts", response_model=list[ShiftDefinitionRead])
def replace_shift_settings(
    payload: list[ShiftDefinitionCreate],
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    existing = session.exec(select(ShiftDefinition).where(ShiftDefinition.user_id == current_user.id)).all()
    for item in existing:
        session.delete(item)
    session.commit()

    for item in payload:
        session.add(ShiftDefinition(user_id=current_user.id, **item.model_dump()))
    session.commit()

    items = session.exec(select(ShiftDefinition).where(ShiftDefinition.user_id == current_user.id).order_by(ShiftDefinition.sort_order)).all()
    return [ShiftDefinitionRead.model_validate(item) for item in items]


@router.patch("/shifts/{shift_id}", response_model=ShiftEntryRead)
def update_shift(
    shift_id: int,
    payload: ShiftEntryUpdate,
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    shift = session.exec(select(ShiftEntry).where(ShiftEntry.id == shift_id, ShiftEntry.user_id == current_user.id)).first()
    if not shift:
        raise HTTPException(status_code=404, detail="Turno non trovato")

    shift.shift_code = payload.shift_code
    shift.shift_label = payload.shift_label
    shift.notes = payload.notes
    shift.manually_edited = True
    session.add(shift)
    session.commit()
    session.refresh(shift)
    return ShiftEntryRead.model_validate(shift)


@router.post("/imports/me", response_model=UploadRead)
async def import_file(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    session: Session = Depends(get_session),
):
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in {".xlsx", ".xlsm", ".docx", ".pdf", ".png", ".jpg", ".jpeg", ".webp"}:
        raise HTTPException(status_code=400, detail="Formato file non supportato")

    uploads_dir = Path(settings.uploads_dir)
    uploads_dir.mkdir(parents=True, exist_ok=True)
    unique_name = f"{uuid.uuid4().hex}{suffix}"
    stored_path = uploads_dir / unique_name
    stored_path.write_bytes(await file.read())

    try:
        upload = import_service.parse_and_store(session, current_user, str(stored_path), file.filename or unique_name)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return UploadRead.model_validate(upload)
