from __future__ import annotations

from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class AnalysisRequest(BaseModel):
    file_id: str
    prediction_result: Optional[Dict[str, Any]] = None
    provider: str = Field(default="deepseek", max_length=32)
    question: Optional[str] = Field(default=None, max_length=500)
