import os
from functools import lru_cache
from typing import List

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass


def _csv(name: str, default: str) -> List[str]:
    return [item.strip() for item in os.getenv(name, default).split(",") if item.strip()]


class Settings:
    app_name: str = "miMuro"
    # En producción se pone DEBUG=false en el host: así las cookies salen
    # Secure + SameSite=None (necesario entre Netlify y el backend).
    debug: bool = os.getenv("DEBUG", "true").lower() not in ("false", "0", "no")
    secret_key: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./mimuro.db")

    # Orígenes permitidos (con cookies hay que listarlos, no vale "*").
    # FRONTEND_URLS="https://mi-muro.netlify.app" permite sumar el sitio real.
    cors_origins: List[str] = _csv(
        "FRONTEND_URLS",
        "http://localhost:5173,http://localhost:3000",
    )
    # Subdominios de Netlify (deploys y previews) siempre permitidos.
    cors_origin_regex: str = r"https://([a-z0-9-]+\.)*netlify\.app$"

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