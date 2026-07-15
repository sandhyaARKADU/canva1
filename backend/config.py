from pydantic_settings import BaseSettings
import os

class Settings(BaseSettings):
    APP_ENV: str = os.getenv("APP_ENV", os.getenv("ENVIRONMENT", "development"))

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
    GEMINI_IMAGE_MODEL: str = "gemini-2.5-flash-image"

    # OpenAI API
    OPENAI_API_KEY: str = ""
    OPENAI_IMAGE_MODEL: str = "gpt-image-1"
    OPENAI_CHAT_MODEL: str = "gpt-4o-mini"

    # Optional image provider fallback
    STABILITY_API_KEY: str = ""
    IMAGE_PROVIDER_ORDER: str = "openai,gemini,stability,pollinations"

    # Server
    HOST: str = "0.0.0.0"
    PORT: int = 5001

    class Config:
        env_file = ".env"

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
