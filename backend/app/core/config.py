import os
from functools import lru_cache
from typing import List

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


class Settings:
    app_name: str = "miMuro"
    debug: bool = True
    secret_key: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./mimuro.db")
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]

    # Email (SMTP) — si SMTP_HOST está vacío se usa el modo desarrollo
    # (el código se imprime en la consola del backend en vez de enviarse)
    smtp_host: str = os.getenv("SMTP_HOST", "")
    smtp_port: int = int(os.getenv("SMTP_PORT", "587"))
    smtp_user: str = os.getenv("SMTP_USER", "")
    smtp_password: str = os.getenv("SMTP_PASSWORD", "")
    smtp_use_tls: bool = os.getenv("SMTP_USE_TLS", "true").lower() != "false"
    smtp_from: str = os.getenv("EMAIL_FROM", "miMuro <no-reply@localhost>")

    # Confirmación de email en el registro
    confirmation_code_expire_minutes: int = int(os.getenv("CONFIRMATION_CODE_EXPIRE_MINUTES", "15"))
    confirmation_max_attempts: int = int(os.getenv("CONFIRMATION_MAX_ATTEMPTS", "5"))
    confirmation_resend_cooldown_seconds: int = int(os.getenv("CONFIRMATION_RESEND_COOLDOWN_SECONDS", "60"))


@lru_cache
def get_settings() -> Settings:
    return Settings()