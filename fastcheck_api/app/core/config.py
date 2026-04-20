from __future__ import annotations

from pathlib import Path

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict

ENV_FILE = Path(__file__).resolve().parents[2] / ".env"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=ENV_FILE, env_file_encoding="utf-8", extra="ignore")

    mongodb_uri: str = Field(default="mongodb://localhost:27017/duxiter", validation_alias="MONGODB_URI")

    jwt_secret: str = Field(default="your-secret-key", validation_alias="VITE_JWT_SECRET")
    jwt_expires_in: str = Field(default="7d", validation_alias="VITE_JWT_EXPIRES_IN")

    api_host: str = Field(default="127.0.0.1", validation_alias="FASTCHECK_API_HOST")
    api_port: int = Field(default=8080, validation_alias="FASTCHECK_API_PORT")
    api_prefix: str = Field(default="/api/v1", validation_alias="FASTCHECK_API_PREFIX")
    cors_origins_raw: str = Field(
        default="*",
        validation_alias="FASTCHECK_CORS_ORIGINS",
        description="Lista de orígenes separados por coma, por ejemplo: https://fastcheck.duxiter.cl,https://otro.com",
    )
    log_level: str = Field(default="INFO", validation_alias="FASTCHECK_LOG_LEVEL")

    legacy_base_url: str = Field(default="http://localhost:4040/api", validation_alias="LEGACY_BASE_URL")
    legacy_http_timeout_seconds: int = Field(default=30, validation_alias="LEGACY_HTTP_TIMEOUT_SECONDS")

    rabbitmq_enabled: bool = Field(default=True, validation_alias="RABBITMQ_ENABLED")
    rabbitmq_queue: str = Field(default="evaluation_queue", validation_alias="RABBITMQ_QUEUE")
    rabbitmq_url: str | None = Field(default=None, validation_alias="RABBITMQ_URL")
    rabbitmq_protocol: str = Field(default="amqp", validation_alias="RABBITMQ_PROTOCOL")
    rabbitmq_username: str = Field(default="guest", validation_alias="RABBITMQ_USERNAME")
    rabbitmq_password: str = Field(default="guest", validation_alias="RABBITMQ_PASSWORD")
    rabbitmq_host: str = Field(default="localhost", validation_alias="RABBITMQ_HOST")
    rabbitmq_port: int = Field(default=5672, validation_alias="RABBITMQ_PORT")
    rabbitmq_vhost: str = Field(default="/", validation_alias="RABBITMQ_VHOST")

    @property
    def mongo_db_name(self) -> str:
        uri = self.mongodb_uri
        after_slash = uri.rsplit("/", 1)[-1]
        if "?" in after_slash:
            return after_slash.split("?", 1)[0]
        if after_slash:
            return after_slash
        return "duxiter"

    @property
    def rabbitmq_connection_url(self) -> str:
        if self.rabbitmq_url:
            return self.rabbitmq_url
        vhost = self.rabbitmq_vhost
        if vhost.startswith("/"):
            vhost = vhost[1:]
        return (
            f"{self.rabbitmq_protocol}://{self.rabbitmq_username}:{self.rabbitmq_password}"
            f"@{self.rabbitmq_host}:{self.rabbitmq_port}/{vhost}"
        )

    @property
    def normalized_api_prefix(self) -> str:
        prefix = (self.api_prefix or "").strip()
        if not prefix:
            return ""
        if not prefix.startswith("/"):
            prefix = f"/{prefix}"
        if len(prefix) > 1 and prefix.endswith("/"):
            prefix = prefix[:-1]
        return prefix

    @property
    def cors_origins(self) -> list[str]:
        raw = (self.cors_origins_raw or "").strip()
        if not raw or raw == "*":
            return ["*"]
        parts = [p.strip() for p in raw.split(",")]
        return [p for p in parts if p]


def get_settings() -> Settings:
    return Settings()


settings = get_settings()
