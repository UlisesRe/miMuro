import os
from functools import lru_cache
from typing import List


class Settings:
    app_name: str = "miMuro"
    debug: bool = True
    secret_key: str = os.getenv("SECRET_KEY", "dev-secret-key-change-in-production")
    algorithm: str = "HS256"
    access_token_expire_minutes: int = 30
    refresh_token_expire_days: int = 7
    database_url: str = os.getenv("DATABASE_URL", "sqlite:///./mimuro.db")
    cors_origins: List[str] = ["http://localhost:5173", "http://localhost:3000"]


@lru_cache
def get_settings() -> Settings:
    return Settings()