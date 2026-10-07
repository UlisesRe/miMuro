from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker, declarative_base
from app.core.config import get_settings

settings = get_settings()

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# Migraciones ligeras: create_all() no agrega columnas a tablas existentes,
# así que se hacen ALTER TABLE puntuales para bases creadas antes del cambio.
_LIGHT_MIGRATIONS = {
    "users": [
        ("is_confirmed", "ALTER TABLE users ADD COLUMN is_confirmed BOOLEAN NOT NULL DEFAULT 0"),
        ("confirmation_code_hash", "ALTER TABLE users ADD COLUMN confirmation_code_hash VARCHAR(64)"),
        ("confirmation_expires_at", "ALTER TABLE users ADD COLUMN confirmation_expires_at DATETIME"),
        ("confirmation_attempts", "ALTER TABLE users ADD COLUMN confirmation_attempts INTEGER NOT NULL DEFAULT 0"),
        ("confirmation_sent_at", "ALTER TABLE users ADD COLUMN confirmation_sent_at DATETIME"),
    ],
}


def run_light_migrations() -> None:
    inspector = inspect(engine)
    for table, columns in _LIGHT_MIGRATIONS.items():
        if not inspector.has_table(table):
            continue
        existing = {col["name"] for col in inspector.get_columns(table)}
        with engine.begin() as conn:
            for name, ddl in columns:
                if name not in existing:
                    conn.execute(text(ddl))
                    if table == "users" and name == "is_confirmed":
                        # Usuarios creados antes de existir la confirmación
                        # quedan confirmados (el flujo nuevo aplica solo a
                        # los registros que empiezan después).
                        conn.execute(text("UPDATE users SET is_confirmed = 1"))


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()