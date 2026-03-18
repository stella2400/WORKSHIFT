from datetime import date, datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict, EmailStr


class RegisterRequest(BaseModel):
    full_name: str
    employee_code: str
    company_name: Optional[str] = None
    team_name: Optional[str] = None
    email: EmailStr
    password: str


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class UserRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    full_name: str
    employee_code: str
    company_name: Optional[str] = None
    team_name: Optional[str] = None
    email: EmailStr


class AuthResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserRead


class ShiftDefinitionCreate(BaseModel):
    code: str
    label: str
    color: str = "#22c55e"
    category: str = "work"
    sort_order: int = 0


class ShiftDefinitionRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    code: str
    label: str
    color: str
    category: str
    sort_order: int
    is_active: bool


class ShiftEntryRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    shift_date: date
    shift_code: str
    shift_label: str
    notes: Optional[str] = None
    manually_edited: bool


class ShiftEntryUpdate(BaseModel):
    shift_code: str
    shift_label: str
    notes: Optional[str] = None


class UploadRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    original_filename: str
    file_type: str
    processing_status: str
    month_label: str
    source_note: Optional[str] = None
    created_at: datetime


class DashboardSummary(BaseModel):
    total_days: int
    work_days: int
    off_days: int
    uploads_count: int


class DashboardResponse(BaseModel):
    user: UserRead
    summary: DashboardSummary
    shifts: list[ShiftEntryRead]
    uploads: list[UploadRead]
    definitions: list[ShiftDefinitionRead]
