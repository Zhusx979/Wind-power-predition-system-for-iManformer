from __future__ import annotations

from typing import List, Optional

from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    file_id: str
    target_column: Optional[str] = None
    time_column: Optional[str] = None
    feature_columns: Optional[List[str]] = None
    window_size: int = Field(default=96, ge=8, le=2000)
    horizon: int = Field(default=24, ge=1, le=336)
    models: List[str] = Field(default_factory=lambda: ["rnn", "lstm", "transformer", "our_model"])
