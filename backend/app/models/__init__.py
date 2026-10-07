import enum
from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, DateTime, ForeignKey, Boolean, Text, JSON, Enum
from sqlalchemy.orm import relationship
from app.core.database import Base


class ToolType(str, enum.Enum):
    pen = "pen"
    eraser = "eraser"


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
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    walls = relationship("Wall", back_populates="owner")
    strokes = relationship("Stroke", back_populates="author")


class Wall(Base):
    __tablename__ = "walls"

    id = Column(Integer, primary_key=True, index=True)
    owner_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    title = Column(String(200), nullable=False)
    slug = Column(String(50), unique=True, index=True, nullable=False)
    background_color = Column(String(7), default="#ffffff")
    is_public = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    owner = relationship("User", back_populates="walls")
    strokes = relationship("Stroke", back_populates="wall", cascade="all, delete-orphan")


class Stroke(Base):
    __tablename__ = "strokes"

    id = Column(Integer, primary_key=True, index=True)
    wall_id = Column(Integer, ForeignKey("walls.id"), nullable=False)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    author_name = Column(String(100), nullable=False)
    tool = Column(Enum(ToolType), default=ToolType.pen)
    color = Column(String(7), default="#000000")
    width = Column(Integer, default=2)
    points = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    wall = relationship("Wall", back_populates="strokes")
    author = relationship("User", back_populates="strokes")


class Signer(Base):
    """Una firma = una persona que entra por el link y deja un trazo.

    El contador global de "Firmas totales" cuenta IPs únicas, no trazos:
    cada IP suma 1 aunque vuelva a entrar y edite, y el dueño NO suma.
    """

    __tablename__ = "signers"

    id = Column(Integer, primary_key=True, index=True)
    ip_hash = Column(String(64), unique=True, index=True, nullable=False)
    wall_id = Column(Integer, ForeignKey("walls.id"), nullable=True)
    author_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    wall = relationship("Wall")
    author = relationship("User")