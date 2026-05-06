from __future__ import annotations

import os
import sys
from pathlib import Path


def _load_env_file(env_path: Path) -> None:
    if not env_path.exists():
        return

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        name, value = line.split("=", 1)
        os.environ.setdefault(name.strip(), value.strip().strip('"').strip("'"))


class Settings:
    def __init__(self) -> None:
        self.api_prefix = "/api/v1"
        self.project_root = _resolve_project_root()
        _load_env_file(self.project_root / "backend" / ".env")
        self.max_preview_rows = 8
        self.max_upload_mb = 80
        self.cors_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
        self.cors_origin_regex = r"^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?$"

    @property
    def data_dir(self) -> Path:
        return self.project_root / "data"


def get_settings() -> Settings:
    return Settings()


def _resolve_project_root() -> Path:
    bundled_root = getattr(sys, "_MEIPASS", None)
    if bundled_root:
        return Path(bundled_root)
    return Path(__file__).resolve().parents[3]


settings = get_settings()
