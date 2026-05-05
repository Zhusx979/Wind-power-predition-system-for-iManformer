from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pandas as pd

from app.core.config import settings
from app.services.preprocessor import infer_columns, preview_rows


def _format_sample_interval(seconds: float) -> str | None:
    if seconds <= 0:
        return None
    if seconds >= 3600:
        hours = seconds / 3600
        return f"{hours:g} 小时"
    if seconds >= 60:
        minutes = seconds / 60
        return f"{minutes:g} 分钟"
    return f"{seconds:g} 秒"


def _describe_time_series(frame: pd.DataFrame, time_column: str | None) -> tuple[dict[str, str] | None, str | None]:
    if not time_column or time_column not in frame.columns:
        return None, None

    parsed = pd.to_datetime(frame[time_column], errors="coerce").dropna().sort_values()
    if parsed.empty:
        return None, None

    time_range = {
        "start": parsed.iloc[0].isoformat(),
        "end": parsed.iloc[-1].isoformat(),
    }
    unique_times = parsed.drop_duplicates()
    if len(unique_times) <= 1:
        return time_range, None

    deltas = unique_times.diff().dropna()
    positive_deltas = deltas[deltas.dt.total_seconds() > 0]
    if positive_deltas.empty:
        return time_range, None

    median_seconds = float(positive_deltas.median().total_seconds())
    return time_range, _format_sample_interval(median_seconds)


@dataclass
class StoredDataset:
    frame: pd.DataFrame
    source_name: str
    metadata: dict[str, Any]
    created_at: str


class DatasetStore:
    def __init__(self) -> None:
        self._items: dict[str, StoredDataset] = {}

    def put(self, frame: pd.DataFrame, source_name: str, metadata: dict[str, Any] | None = None) -> str:
        file_id = str(uuid4())
        self._items[file_id] = StoredDataset(
            frame=frame,
            source_name=source_name,
            metadata=metadata or {},
            created_at=datetime.now(timezone.utc).isoformat(),
        )
        return file_id

    def get(self, file_id: str) -> pd.DataFrame:
        if file_id not in self._items:
            raise ValueError("file_id 不存在，请先上传文件或加载样例数据")
        return self._items[file_id].frame.copy()

    def describe(self, file_id: str) -> dict[str, Any]:
        if file_id not in self._items:
            raise ValueError("file_id 不存在，请先上传文件或加载样例数据")

        item = self._items[file_id]
        inferred = infer_columns(item.frame)
        column_count = len(item.frame.columns)
        numeric_columns = int(item.frame.select_dtypes(include="number").shape[1])
        time_column = inferred.get("time_column")
        target_column = inferred.get("target_column")
        time_range, sample_interval = _describe_time_series(item.frame, time_column)
        preview = preview_rows(item.frame, settings.max_preview_rows)
        return {
            "file_id": file_id,
            "source_name": item.source_name,
            "created_at": item.created_at,
            "rows": int(len(item.frame)),
            "columns": [str(c) for c in item.frame.columns],
            "column_count": column_count,
            "numeric_column_count": numeric_columns,
            "preview": preview,
            "inferred": inferred,
            "time_range": time_range,
            "sample_interval": sample_interval,
            "preview_columns": list(preview[0].keys()) if preview else [],
            "metadata": item.metadata,
            "has_data": len(item.frame) > 0,
            "target_name": target_column,
        }


dataset_store = DatasetStore()
