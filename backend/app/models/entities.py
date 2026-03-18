from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sqlmodel import SQLModel, Field


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: Optional[int] = Field(default=None, primary_key=True)
    email: str = Field(index=True, unique=True)
    password_hash: str
    full_name: str
    employee_code: str = Field(index=True)
    team_name: Optional[str] = None
    company_name: Optional[str] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ShiftDefinition(SQLModel, table=True):
    __tablename__ = "shift_definitions"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    code: str = Field(index=True)
    label: str
    color: str = "#22c55e"
    category: str = "work"
    sort_order: int = 0
    is_active: bool = True


class Upload(SQLModel, table=True):
    __tablename__ = "uploads"

    id: Optional[int] = Field(default=None, primary_key=True)
    user_id: int = Field(foreign_key="users.id", index=True)
    original_filename: str
    stored_path: str
    file_type: str
    processing_status: str = "processed"
    month_label: str
    source_note: Optional[str] = None
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
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
