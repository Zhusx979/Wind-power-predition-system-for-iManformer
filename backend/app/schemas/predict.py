from __future__ import annotations

from pydantic import BaseModel, Field


class PredictRequest(BaseModel):
    file_id: str
    target_column: str | None = None
    time_column: str | None = None
    feature_columns: list[str] | None = None
    window_size: int = Field(default=96, ge=8, le=2000)
    horizon: int = Field(default=24, ge=1, le=336)
    models: list[str] = Field(default_factory=lambda: ["rnn", "lstm", "transformer", "our_model"])
