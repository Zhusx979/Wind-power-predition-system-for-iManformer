from __future__ import annotations

from pydantic import BaseModel, Field


class LoadSampleRequest(BaseModel):
    filename: str = Field(..., min_length=1)
