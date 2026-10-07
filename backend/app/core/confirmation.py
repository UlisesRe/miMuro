import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import User

settings = get_settings()


def utcnow() -> datetime:
    """Ahora en UTC sin tzinfo para comparar de forma segura con SQLite."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _as_naive_utc(value: datetime) -> datetime:
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def generate_code() -> str:
    """Código numérico de 6 dígitos (uniforme, sin sesgo)."""
    return f"{secrets.randbelow(1_000_000):06d}"


def hash_code(code: str) -> str:
    """HMAC-SHA256 del código con la secret key como pepper.

    En la base solo queda el hash: un volcado de la DB no revela códigos.
    """
    return hmac.new(
        settings.secret_key.encode("utf-8"),
        code.encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()


def issue_code(user: User, db: Session) -> str:
    """Genera y guarda un código nuevo para el usuario. Invalida el anterior."""
    code = generate_code()
    user.confirmation_code_hash = hash_code(code)
    user.confirmation_expires_at = utcnow() + timedelta(
        minutes=settings.confirmation_code_expire_minutes
    )
    user.confirmation_attempts = 0
    user.confirmation_sent_at = utcnow()
    db.add(user)
    db.commit()
    db.refresh(user)
    return code


def clear_code(user: User, db: Session) -> None:
    user.confirmation_code_hash = None
    user.confirmation_expires_at = None
    user.confirmation_attempts = 0
    db.add(user)
    db.commit()


def code_is_expired(user: User) -> bool:
    if user.confirmation_expires_at is None:
        return True
    return _as_naive_utc(user.confirmation_expires_at) <= utcnow()


def seconds_until_resend(user: User) -> int:
    """Segundos que faltan para poder reenviar (0 si ya puede)."""
    if user.confirmation_sent_at is None:
        return 0
    elapsed = (utcnow() - _as_naive_utc(user.confirmation_sent_at)).total_seconds()
    remaining = settings.confirmation_resend_cooldown_seconds - elapsed
    return max(0, int(remaining))


def verify_code(user: User, code: str, db: Session) -> tuple[bool, str]:
    """Valida el código. Devuelve (ok, mensaje) y maneja intentos/expiración."""
    if not user.confirmation_code_hash:
        return False, "No hay un código pendiente. Solicitá uno nuevo."

    if code_is_expired(user):
        clear_code(user, db)
        return False, "El código expiró. Solicitá uno nuevo."

    if not hmac.compare_digest(user.confirmation_code_hash, hash_code(code)):
        user.confirmation_attempts = (user.confirmation_attempts or 0) + 1
        if user.confirmation_attempts >= settings.confirmation_max_attempts:
            clear_code(user, db)
            return False, "Código invalidado por intentos fallidos. Solicitá uno nuevo."
        db.add(user)
        db.commit()
        remaining = settings.confirmation_max_attempts - user.confirmation_attempts
        return False, f"Código incorrecto. Te quedan {remaining} intentos."

    user.is_confirmed = True
    clear_code(user, db)
    return True, "Cuenta confirmada."
