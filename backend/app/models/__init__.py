from datetime import datetime, timezone

from sqlalchemy import Boolean, Column, DateTime, ForeignKey, Integer, String, Text

from app.core.database import Base


def _now() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    name = Column(String(100), nullable=False)
    password_hash = Column(String(255), nullable=False)
    is_confirmed = Column(Boolean, default=False, nullable=False)
    confirmation_code_hash = Column(String(64), nullable=True)
    confirmation_expires_at = Column(DateTime(timezone=True), nullable=True)
    confirmation_attempts = Column(Integer, default=0, nullable=False)
    confirmation_sent_at = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class Wall(Base):
    """Un muro: un lienzo con nombre, color y visibilidad, de un dueño."""

    __tablename__ = "walls"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    title = Column(String(100), nullable=False)
    slug = Column(String(16), unique=True, index=True, nullable=False)
    background_color = Column(String(9), nullable=False, default="#ffffff")
    is_public = Column(Boolean, nullable=False, default=True)
    created_at = Column(DateTime(timezone=True), default=_now)
    updated_at = Column(DateTime(timezone=True), default=_now, onupdate=_now)


class Stroke(Base):
    """Un trazo del lienzo.

    Se guarda como datos (`tool`, `color`, `width` y `points` en JSON) y no
    como píxeles: así el lienzo se puede redibujar a cualquier tamaño, la
    goma se aplica solo sobre los trazos y el modo "ver" reconstruye igual.
    """

    __tablename__ = "strokes"

    id = Column(Integer, primary_key=True, index=True)
    wall_id = Column(Integer, ForeignKey("walls.id"), nullable=False, index=True)
    tool = Column(String(10), nullable=False, default="pen")
    color = Column(String(9), nullable=False, default="#111111")
    width = Column(Integer, nullable=False, default=4)
    points = Column(Text, nullable=False, default="[]")
    # Vacío = trazo del dueño. Con nombre = firma de un invitado.
    signer_name = Column(String(60), nullable=True)
    # Columna legada de la versión anterior: en `mimuro.db` es NOT NULL, así
    # que hay que mapearla y llenarla aunque el código ya no la lea (si no,
    # el INSERT falla con "NOT NULL constraint failed: strokes.author_name").
    # Los tests no la ven porque conftest crea una DB fresca con create_all().
    author_name = Column(String(100), nullable=False, default="")
    created_at = Column(DateTime(timezone=True), default=_now)
