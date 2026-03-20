from datetime import date, datetime
from typing import Optional, List, Dict
from pydantic import BaseModel, ConfigDict, field_validator
import re


def _validate_pwd(v: str) -> str:
    if len(v) < 8:
        raise ValueError("Minimo 8 caratteri")
    if not re.search(r'[A-Z]', v):
        raise ValueError("Almeno una maiuscola")
    if not re.search(r'\d', v):
        raise ValueError("Almeno un numero")
    if not re.search(r'[!@#$%^&*()\-_=+\[\]{};:\'",.<>/?\\|`~]', v):
        raise ValueError("Almeno un carattere speciale")
    return v


# ── Auth ──────────────────────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    full_name: str
    employee_code: str
    company_name: Optional[str] = None
    team_name: Optional[str] = None
    email: str
    password: str
    role: str = "user"

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_pwd(v)


class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        return _validate_pwd(v)


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None
    company_name: Optional[str] = None
    team_name: Optional[str] = None
    email: Optional[str] = None


class AdminResetPasswordRequest(BaseModel):
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        return _validate_pwd(v)


class ForgotPasswordRequest(BaseModel):
    email: str
    employee_code: str


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str) -> str:
        return _validate_pwd(v)


class DashboardCardConfig(BaseModel):
    label: str
    code: str


class UpdateDashboardConfigRequest(BaseModel):
    cards: List[DashboardCardConfig]


# ── Users ─────────────────────────────────────────────────────────────────────

class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    employee_code: str
    company_name: Optional[str] = None
    team_name: Optional[str] = None
    email: str
    role: str
    is_active: bool
    must_change_password: bool
    dashboard_config: Optional[str] = None


class UserReadShort(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    full_name: str
    employee_code: str
    team_name: Optional[str] = None
    company_name: Optional[str] = None
    role: str


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


# ── Company & Team ────────────────────────────────────────────────────────────

class CompanyCreate(BaseModel):
    name: str
    description: Optional[str] = None


class CompanyRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str] = None
    created_at: datetime


class TeamCreate(BaseModel):
    name: str
    description: Optional[str] = None
    company_id: int


class TeamRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str] = None
    company_id: int
    created_at: datetime


class TeamConfigRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_name: str
    team_name: str
    standard_hours: float


class TeamConfigUpdate(BaseModel):
    standard_hours: float


# ── Shift Definitions ─────────────────────────────────────────────────────────

class ShiftDefinitionCreate(BaseModel):
    code: str
    label: str
    color: str = "#22c55e"
    category: str = "work"
    sort_order: int = 0
    time_start: Optional[str] = None
    time_end: Optional[str] = None
    default_hours: Optional[float] = None


class ShiftDefinitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    label: str
    color: str
    category: str
    sort_order: int
    is_active: bool
    time_start: Optional[str] = None
    time_end: Optional[str] = None
    default_hours: Optional[float] = None


# ── Shift Entries ─────────────────────────────────────────────────────────────

class ShiftEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    shift_date: date
    shift_code: str
    shift_label: str
    notes: Optional[str] = None
    manually_edited: bool
    user_id: int
    time_start: Optional[str] = None
    time_end: Optional[str] = None
    actual_time_start: Optional[str] = None
    actual_time_end: Optional[str] = None
    hours_worked: Optional[float] = None
    overtime_hours: Optional[float] = None


class ShiftEntryUpdate(BaseModel):
    shift_code: str
    shift_label: str
    notes: Optional[str] = None
    actual_time_start: Optional[str] = None
    actual_time_end: Optional[str] = None


class ManualShiftEntry(BaseModel):
    """Manager manually assigns a shift to a user for a specific date."""
    user_id: int
    shift_date: date
    shift_code: str
    shift_label: str
    time_start: Optional[str] = None
    time_end: Optional[str] = None
    notes: Optional[str] = None
    station_code: Optional[str] = None


# ── Uploads ───────────────────────────────────────────────────────────────────

class UploadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    original_filename: str
    file_type: str
    processing_status: str
    month_label: str
    source_note: Optional[str] = None
    users_processed: int = 0
    users_skipped: int = 0
    created_at: datetime


class BulkImportResponse(BaseModel):
    upload: UploadRead
    processed: List[str]
    skipped: List[str]
    errors: List[List[str]]
    month_label: str


# ── Dashboard ─────────────────────────────────────────────────────────────────

class DashboardSummary(BaseModel):
    total_days: int
    work_days: int
    off_days: int
    uploads_count: int
    hours_worked: float
    overtime_hours: float
    by_code: Dict[str, int]


class DashboardResponse(BaseModel):
    user: UserRead
    summary: DashboardSummary
    shifts: List[ShiftEntryRead]
    uploads: List[UploadRead]
    definitions: List[ShiftDefinitionRead]
    station_definitions: List["WorkStationDefinitionRead"] = []
    stations: List["WorkStationEntryRead"] = []
    team_config: Optional[TeamConfigRead] = None


# ── Swaps ─────────────────────────────────────────────────────────────────────

class SwapRequestCreate(BaseModel):
    target_id: int
    requester_shift_id: int
    target_shift_id: int
    requester_note: Optional[str] = None


class SwapRequestRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    requester_id: int
    target_id: int
    requester_shift_id: int
    target_shift_id: int
    status: str
    requester_note: Optional[str] = None
    target_note: Optional[str] = None
    manager_note: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class SwapRequestAction(BaseModel):
    action: str
    note: Optional[str] = None


# ── Colleagues ────────────────────────────────────────────────────────────────

class ColleagueRead(BaseModel):
    id: int
    full_name: str
    employee_code: str
    shift_code: str
    shift_label: str
    station_name: Optional[str] = None


class TeamMemberShifts(BaseModel):
    user: UserReadShort
    shifts: List[ShiftEntryRead]


# ── Workstations ──────────────────────────────────────────────────────────────

class WorkStationDefinitionCreate(BaseModel):
    name: str
    description: Optional[str] = None
    color: str = "#6ee7b7"
    sort_order: int = 0


class WorkStationDefinitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    name: str
    description: Optional[str] = None
    color: str
    sort_order: int
    is_active: bool


class WorkStationEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    assigned_date: Optional[date]
    month_label: Optional[str]
    station_name: str
    validity: str

# ── Extra schemas for v7 ──────────────────────────────────────────────────────

class SwapDetailRead(BaseModel):
    """Enriched swap with full user and shift details."""
    id: int
    status: str
    requester_id: int
    requester_name: str
    requester_employee_code: str
    target_id: int
    target_name: str
    target_employee_code: str
    requester_shift_date: Optional[date] = None
    requester_shift_code: str = ""
    requester_shift_label: str = ""
    target_shift_date: Optional[date] = None
    target_shift_code: str = ""
    target_shift_label: str = ""
    requester_note: Optional[str] = None
    target_note: Optional[str] = None
    manager_note: Optional[str] = None
    created_at: datetime
    updated_at: datetime


class WorkStationDefinitionCreate(BaseModel):
    code: str
    label: str
    color: str = "#6ee7b7"
    sort_order: int = 0


class WorkStationDefinitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    code: str
    label: str
    color: str
    sort_order: int
    is_active: bool


class WorkStationEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    user_id: int
    assigned_date: Optional[date]
    month_label: Optional[str]
    station_code: str
    station_label: Optional[str]
    validity: str


class TeamConfigRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: int
    company_name: str
    team_name: str
    standard_hours: float
    search_by: str = "matricola"


class TeamConfigUpdate(BaseModel):
    standard_hours: float
    search_by: str = "matricola"
