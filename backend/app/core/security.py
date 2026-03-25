from datetime import datetime, timedelta, UTC
from typing import Optional
import re
import bcrypt
import jwt

from app.core.config import get_settings

ALGORITHM = "HS256"

PASSWORD_REGEX = re.compile(
    r'^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};\':"\\|,.<>\/?]).{8,}$'
)


def validate_password(password: str) -> str:
    """Returns error message if invalid, empty string if valid."""
    if len(password) < 8:
        return "La password deve essere di almeno 8 caratteri"
    if not re.search(r'[A-Z]', password):
        return "La password deve contenere almeno una lettera maiuscola"
    if not re.search(r'\d', password):
        return "La password deve contenere almeno un numero"
    if not re.search(r'[!@#$%^&*()\-_=+\[\]{};:\'",.<>/?\\|`~]', password):
        return "La password deve contenere almeno un carattere speciale (!@#$...)"
    return ""


def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))


def create_access_token(subject: str) -> str:
    settings = get_settings()
    expire = datetime.now(UTC) + timedelta(minutes=settings.jwt_expire_minutes)
    return jwt.encode({"sub": subject, "exp": expire}, settings.jwt_secret_key, algorithm=ALGORITHM)


def decode_access_token(token: str) -> Optional[str]:
    settings = get_settings()
    try:
        payload = jwt.decode(token, settings.jwt_secret_key, algorithms=[ALGORITHM])
        return payload.get("sub")
    except jwt.PyJWTError:
        return None
