from contextlib import asynccontextmanager
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.routes import router
from app.core.config import get_settings
from app.db.session import create_db_and_tables, get_session_direct

logging.basicConfig(level=logging.INFO)
settings = get_settings()

DEFAULT_ADMIN = {
    "email": "vincenzostella00@gmail.com",
    "password_hash": "$2b$12$oW7txxZ2hX6DAwpbzpY7auAelZhomha4KUT5qGciCXbHGZvO4QL0W",
    "full_name": "Vincenzo Stella",
    "employee_code": "2405",
    "team_name": "Admin",
    "company_name": "Informatica",
    "role": "admin",
    "is_active": True,
    "must_change_password": False,
}


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger = logging.getLogger("workshift")
    try:
        logger.info("Creating database tables...")
        create_db_and_tables()
        logger.info("DB ready.")
        # Ensure default admin exists
        _ensure_default_admin(logger)
    except Exception as e:
        logger.error(f"Startup error: {e}")
        raise
    yield


def _ensure_default_admin(logger):
    from sqlmodel import select
    from app.models.entities import User
    try:
        with get_session_direct() as session:
            existing = session.exec(select(User).where(User.email == DEFAULT_ADMIN["email"])).first()
            if not existing:
                admin = User(**DEFAULT_ADMIN)
                session.add(admin)
                session.commit()
                logger.info("Default admin created: %s", DEFAULT_ADMIN["email"])
            else:
                logger.info("Default admin already exists: %s", DEFAULT_ADMIN["email"])
    except Exception as e:
        logger.warning("Could not create default admin: %s", e)


app = FastAPI(title="WorkShift API", version="7.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[x.strip() for x in settings.cors_origins.split(",") if x.strip()],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api")
