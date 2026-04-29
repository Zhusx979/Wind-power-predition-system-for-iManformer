from __future__ import annotations

from io import BytesIO
from pathlib import Path
from typing import TYPE_CHECKING, Any

import pandas as pd

from app.core.config import settings

if TYPE_CHECKING:
    from fastapi import UploadFile

SUPPORTED_SUFFIXES = {".csv", ".xlsx", ".xls"}


def _validate_suffix(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_SUFFIXES:
        raise ValueError("仅支持 CSV、XLSX、XLS 文件")
    return suffix


def _read_dataframe(content: bytes, filename: str) -> tuple[pd.DataFrame, dict[str, Any]]:
    suffix = _validate_suffix(filename)
    if suffix == ".csv":
        df = pd.read_csv(BytesIO(content))
        sheet_name = None
    else:
        workbook = pd.ExcelFile(BytesIO(content))
        sheet_name = workbook.sheet_names[0]
        df = pd.read_excel(workbook, sheet_name=sheet_name)

    if df.empty:
        raise ValueError("数据文件为空")
    if len(df.columns) < 2:
        raise ValueError("数据至少需要包含时间列和目标列")

    df = df.dropna(how="all").copy()
    df.columns = [str(c).strip() for c in df.columns]
    return df, {"sheet_name": sheet_name, "suffix": suffix}


async def load_dataframe_from_upload(file: UploadFile) -> tuple[pd.DataFrame, dict[str, Any]]:
    filename = file.filename or ""
    _validate_suffix(filename)
    content = await file.read()
    max_bytes = settings.max_upload_mb * 1024 * 1024
    if len(content) > max_bytes:
        raise ValueError(f"文件过大，当前限制为 {settings.max_upload_mb}MB")
    return _read_dataframe(content, filename)


def list_sample_files() -> list[str]:
    data_dir = settings.data_dir
    if not data_dir.exists() or not data_dir.is_dir():
        return []

    return sorted(
        path.name
        for path in data_dir.iterdir()
        if path.is_file() and path.suffix.lower() in SUPPORTED_SUFFIXES
    )


def load_sample_dataframe(filename: str) -> tuple[pd.DataFrame, dict[str, Any]]:
    safe_name = Path(filename).name
    path = settings.data_dir / safe_name
    if not path.exists():
        raise ValueError("样例数据不存在")
    if path.parent.resolve() != settings.data_dir.resolve():
        raise ValueError("非法样例数据路径")
    content = path.read_bytes()
    df, metadata = _read_dataframe(content, path.name)
    metadata["sample_path"] = str(path)
    return df, metadata
