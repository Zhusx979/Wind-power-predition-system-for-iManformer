from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

import pandas as pd

from app.core.config import settings
from app.services.preprocessor import infer_columns, preview_rows


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
        return {
            "file_id": file_id,
            "source_name": item.source_name,
            "created_at": item.created_at,
            "rows": int(len(item.frame)),
            "columns": [str(c) for c in item.frame.columns],
            "preview": preview_rows(item.frame, settings.max_preview_rows),
            "inferred": inferred,
            "metadata": item.metadata,
        }


dataset_store = DatasetStore()
