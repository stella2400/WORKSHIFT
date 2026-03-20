from __future__ import annotations
from datetime import date, datetime
from typing import Optional
from sqlmodel import SQLModel, Field, Column
from sqlalchemy import Text


class Company(SQLModel, table=True):
    __tablename__ = "companies"
    id: Optional[int] = Field(default=None, primary_key=True)
    name: str = Field(unique=True, index=True)
    description: Optional[str] = None
    created_by: int = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Team(SQLModel, table=True):
    __tablename__ = "teams"
    id: Optional[int] = Field(default=None, primary_key=True)
    company_id: int = Field(foreign_key="companies.id", index=True)
    name: str
    description: Optional[str] = None
    created_by: int = Field(foreign_key="users.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class TeamConfig(SQLModel, table=True):
    __tablename__ = "team_configs"
    id: Optional[int] = Field(default=None, primary_key=True)
    company_name: str = Field(index=True)
    team_name: str = Field(index=True)
    standard_hours: float = Field(default=6.0)
    # How to match users in import files: "matricola" | "nome"
    search_by: str = Field(default="matricola")
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class User(SQLModel, table=True):
    __tablename__ = "users"
    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    full_name: str
    employee_code: str = Field(index=True, unique=True)
    team_name: Optional[str] = None
    company_name: Optional[str] = None
    role: str = Field(default="user")
    is_active: bool = Field(default=True)
    must_change_password: bool = Field(default=False)
    dashboard_config: Optional[str] = Field(default=None, sa_column=Column(Text))
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ShiftDefinition(SQLModel, table=True):
    __tablename__ = "shift_definitions"
    id: Optional[int] = Field(default=None, primary_key=True)
    company_name: str = Field(index=True)
    team_name: str = Field(index=True)
    code: str
    label: str
    color: str = "#22c55e"
    category: str = "work"
    sort_order: int = 0
    is_active: bool = True
    time_start: Optional[str] = None
    time_end: Optional[str] = None
    default_hours: Optional[float] = None


class WorkStationDefinition(SQLModel, table=True):
    """Named workstation codes defined by manager."""
    __tablename__ = "workstation_definitions"
    id: Optional[int] = Field(default=None, primary_key=True)
    company_name: str = Field(index=True)
    team_name: str = Field(index=True)
    code: str           # e.g. "P1", "P9", "BOX1"
    label: str          # e.g. "Postazione 1 - Triage"
    color: str = "#6ee7b7"
    sort_order: int = 0
    is_active: bool = True
    created_at: datetime = Field(default_factory=datetime.utcnow)


class Upload(SQLModel, table=True):
    __tablename__ = "uploads"
    id: Optional[int] = Field(default=None, primary_key=True)
    uploaded_by: int = Field(foreign_key="users.id")
    company_name: str
    team_name: str
    original_filename: str
    stored_path: str
    file_type: str
    upload_kind: str = "shifts"   # "shifts" | "stations"
    processing_status: str = "processed"
    month_label: str
    source_note: Optional[str] = None
    users_processed: int = Field(default=0)
    users_skipped: int = Field(default=0)
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ShiftEntry(SQLModel, table=True):
    __tablename__ = "shift_entries"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    upload_id: Optional[int] = Field(default=None, foreign_key="uploads.id", index=True)
    shift_date: date = Field(index=True)
    shift_code: str
    shift_label: str
    notes: Optional[str] = None
    manually_edited: bool = False
    time_start: Optional[str] = None
    time_end: Optional[str] = None
    actual_time_start: Optional[str] = None
    actual_time_end: Optional[str] = None
    hours_worked: Optional[float] = None
    overtime_hours: Optional[float] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class WorkStationEntry(SQLModel, table=True):
    __tablename__ = "workstation_entries"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    upload_id: Optional[int] = Field(default=None, foreign_key="uploads.id")
    assigned_date: Optional[date] = Field(default=None, index=True)
    month_label: Optional[str] = None
    station_code: str
    station_label: Optional[str] = None
    validity: str = "daily"
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ShiftSwapRequest(SQLModel, table=True):
    __tablename__ = "shift_swap_requests"
    id: Optional[int] = Field(default=None, primary_key=True)
    requester_id: int = Field(foreign_key="users.id", index=True)
    target_id: int = Field(foreign_key="users.id", index=True)
    requester_shift_id: int = Field(foreign_key="shift_entries.id")
    target_shift_id: int = Field(foreign_key="shift_entries.id")
    status: str = Field(default="pending_target")
    requester_note: Optional[str] = None
    target_note: Optional[str] = None
    manager_note: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class PasswordResetToken(SQLModel, table=True):
    __tablename__ = "password_reset_tokens"
    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    token: str = Field(index=True, unique=True)
    expires_at: datetime
    used: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)
