from contextlib import contextmanager
from sqlmodel import SQLModel, Session, create_engine
from app.core.config import get_settings
from app.models import entities  # noqa

settings = get_settings()
engine = create_engine(settings.database_url, echo=False, pool_pre_ping=True)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session


@contextmanager
def get_session_direct():
    with Session(engine) as session:
        yield session
