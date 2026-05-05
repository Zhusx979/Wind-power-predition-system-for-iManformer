from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field


class AnalysisRequest(BaseModel):
    file_id: str
    prediction_result: dict[str, Any] | None = None
    provider: str = Field(default="deepseek", max_length=32)
    question: str | None = Field(default=None, max_length=500)
