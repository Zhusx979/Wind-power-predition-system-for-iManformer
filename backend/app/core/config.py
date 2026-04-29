from __future__ import annotations

from pathlib import Path


class Settings:
    def __init__(self) -> None:
        self.api_prefix = "/api/v1"
        self.project_root = Path(__file__).resolve().parents[3]
        self.max_preview_rows = 8
        self.max_upload_mb = 80
        self.cors_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]

    @property
    def data_dir(self) -> Path:
        return self.project_root / "data"


def get_settings() -> Settings:
    return Settings()


settings = get_settings()
