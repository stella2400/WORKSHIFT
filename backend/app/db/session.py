from contextlib import contextmanager
from sqlmodel import SQLModel, Session, create_engine
from app.core.config import get_settings
from app.models import entities  # noqa


def _fix_db_url(url: str) -> str:
    """
    Render (e altri host) fornisce URL con schema 'postgresql://' o 'postgres://'.
    SQLAlchemy con driver psycopg v3 richiede 'postgresql+psycopg://'.
    Questa funzione converte automaticamente qualsiasi variante.
    """
    if url.startswith("postgres://"):
        url = "postgresql+psycopg://" + url[len("postgres://"):]
    elif url.startswith("postgresql://"):
        url = "postgresql+psycopg://" + url[len("postgresql://"):]
    # Se già corretto (postgresql+psycopg://) lascia invariato
    return url


settings = get_settings()
_db_url = _fix_db_url(settings.database_url)
engine = create_engine(_db_url, echo=False, pool_pre_ping=True)


def create_db_and_tables():
    SQLModel.metadata.create_all(engine)


def get_session():
    with Session(engine) as session:
        yield session


@contextmanager
def get_session_direct():
    with Session(engine) as session:
        yield session
