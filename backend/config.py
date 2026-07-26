from pathlib import Path
import hashlib
import os

from dotenv import load_dotenv
from pydantic_settings import BaseSettings

BACKEND_DIR = Path(__file__).resolve().parent
ENV_PATH = BACKEND_DIR / ".env"
APP_ENV_VALUE = os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "development"))
ENV_OVERRIDE_ENABLED = APP_ENV_VALUE.lower() not in {"prod", "production"}
ENV_LOADED = ENV_PATH.exists()
if ENV_LOADED:
    load_dotenv(ENV_PATH, override=ENV_OVERRIDE_ENABLED)

class Settings(BaseSettings):
    APP_ENV: str = APP_ENV_VALUE

    # MySQL Database
    DB_HOST: str = "localhost"
    DB_PORT: int = 3306
    DB_USER: str = "root"
    DB_PASSWORD: str = ""
    DB_NAME: str = "teckstudio"

    # JWT
    JWT_SECRET: str = ""
    JWT_ALGORITHM: str = "HS256"
    JWT_EXPIRY_DAYS: int = 7

    # Google Gemini AI
    GEMINI_API_KEY: str = ""
    GEMINI_MODEL: str = "gemini-2.0-flash"
    GEMINI_IMAGE_MODEL: str = "gemini-2.5-flash-image"

    # OpenAI API
    OPENAI_API_KEY: str = ""
    OPENAI_MODEL: str = "gpt-4o-mini"
    OPENAI_IMAGE_MODEL: str = "gpt-image-1"
    OPENAI_CHAT_MODEL: str = "gpt-4o-mini"

    # Optional image provider fallback
    STABILITY_API_KEY: str = ""
    AI_PROVIDER_PRIORITY: str = ""
    IMAGE_PROVIDER_ORDER: str = "openai,gemini,pollinations"
    AI_CHAT_PROVIDER_PRIORITY: str = "gemini,openai,pollinations"
    AI_IMAGE_TIMEOUT_SECONDS: int = 60
    AI_IMAGE_MAX_RETRIES: int = 2
    ENABLE_POLLINATIONS_FALLBACK: bool = True
    ENABLE_FAKE_AI_FALLBACK: bool = False

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 5001

    class Config:
        env_file = str(ENV_PATH)


def key_fingerprint(value: str) -> str | None:
    """Return a non-secret one-way key fingerprint for diagnostics."""
    cleaned = (value or "").strip()
    if not cleaned:
        return None
    return hashlib.sha256(cleaned.encode("utf-8")).hexdigest()[:12]

settings = Settings()

INSECURE_JWT_SECRETS = {
    "",
    "super_secret_key_for_teckstudio_2026",
    "change-me",
    "changeme",
    "secret",
    "supersecret",
}


def validate_security_settings() -> None:
    """Fail fast when authentication is configured insecurely."""
    jwt_secret = settings.JWT_SECRET.strip()
    if jwt_secret in INSECURE_JWT_SECRETS:
        raise RuntimeError("JWT_SECRET must be set to a strong secret in the environment.")

    if settings.APP_ENV.lower() in {"prod", "production"} and len(jwt_secret) < 32:
        raise RuntimeError("Production JWT_SECRET must be at least 32 characters long.")

# Build MySQL URL
DATABASE_URL = f"mysql+pymysql://{settings.DB_USER}:{settings.DB_PASSWORD}@{settings.DB_HOST}:{settings.DB_PORT}/{settings.DB_NAME}"
