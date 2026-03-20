from functools import lru_cache
from typing import Optional
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    database_url: str = "postgresql+psycopg://workshift:workshift@localhost:5432/workshift"
    jwt_secret_key: str = "changeme-in-production"
    jwt_expire_minutes: int = 10080
    frontend_url: str = "http://localhost:5173"
    cors_origins: str = "http://localhost:5173,http://127.0.0.1:5173"
    uploads_dir: str = "/app/uploads"

    registration_open: bool = True
    admin_registration_token: str = "change-this-admin-token"

    smtp_host: str = "smtp.gmail.com"
    smtp_port: int = 587
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_tls: bool = True

    # HF token + model — usa api-inference.huggingface.co (nessun provider speciale richiesto)
    hf_token: Optional[str] = None
    hf_model: str = "Qwen/Qwen2.5-VL-7B-Instruct"
    # hf_provider non più usato, mantenuto per compatibilità .env esistenti
    hf_provider: str = "hf-inference"

    admin_email: str = ""
    admin_password: str = ""
    admin_employee_code: str = "ADMIN001"

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")


@lru_cache
def get_settings() -> Settings:
    return Settings()
