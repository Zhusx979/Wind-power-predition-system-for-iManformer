from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd


def _normalized(name: str) -> str:
    return " ".join(str(name).strip().lower().replace("_", " ").split())


def infer_columns(df: pd.DataFrame) -> dict[str, Any]:
    columns = [str(c) for c in df.columns]
    normalized = {c: _normalized(c) for c in columns}

    time_column = next(
        (c for c, n in normalized.items() if "time" in n or "date" in n or "timestamp" in n),
        columns[0] if columns else None,
    )
    target_column = next(
        (c for c, n in normalized.items() if n in {"power", "power (mw)"} or "power" in n),
        None,
    )

    numeric_columns = []
    for column in columns:
        if column == time_column:
            continue
        converted = pd.to_numeric(df[column], errors="coerce")
        if converted.notna().sum() > 0:
            numeric_columns.append(column)

    if target_column is None and numeric_columns:
        target_column = numeric_columns[-1]

    feature_columns = [c for c in numeric_columns if c != target_column]
    aliases = {
        "wind_speed": next((c for c, n in normalized.items() if "wind speed" in n and "hub" in n and "m/s" in n), None),
        "wind_direction": next((c for c, n in normalized.items() if "wind direction" in n), None),
        "temperature": next((c for c, n in normalized.items() if "temperature" in n), None),
        "pressure": next((c for c, n in normalized.items() if "atmosphere" in n or "pressure" in n), None),
        "humidity": next((c for c, n in normalized.items() if "humidity" in n), None),
        "power": target_column,
        "timestamp": time_column,
    }

    return {
        "time_column": time_column,
        "target_column": target_column,
        "feature_columns": feature_columns,
        "aliases": aliases,
    }


def preview_rows(df: pd.DataFrame, limit: int) -> list[dict[str, Any]]:
    sample = df.head(limit).replace({np.nan: None})
    rows: list[dict[str, Any]] = []
    for record in sample.to_dict(orient="records"):
        rows.append({str(k): _json_safe(v) for k, v in record.items()})
    return rows


def _json_safe(value: Any) -> Any:
    if isinstance(value, pd.Timestamp):
        return value.isoformat()
    if hasattr(value, "item"):
        return value.item()
    return value


def prepare_forecast_frame(
    df: pd.DataFrame,
    time_column: str | None,
    target_column: str | None,
    feature_columns: list[str] | None,
    horizon: int,
) -> tuple[pd.DataFrame, dict[str, Any]]:
    inferred = infer_columns(df)
    time_col = time_column or inferred["time_column"]
    target_col = target_column or inferred["target_column"]

    if not time_col or time_col not in df.columns:
        raise ValueError("无法识别时间列，请在请求中指定 time_column")
    if not target_col or target_col not in df.columns:
        raise ValueError("无法识别目标功率列，请在请求中指定 target_column")

    features = feature_columns or inferred["feature_columns"]
    missing_features = [c for c in features if c not in df.columns]
    if missing_features:
        raise ValueError(f"特征列不存在: {', '.join(missing_features)}")

    work = df[[time_col, target_col, *features]].copy()
    work[time_col] = pd.to_datetime(work[time_col], errors="coerce")
    work[target_col] = pd.to_numeric(work[target_col], errors="coerce")
    for column in features:
        work[column] = pd.to_numeric(work[column], errors="coerce")

    work = work.dropna(subset=[time_col, target_col]).sort_values(time_col)
    if len(work) <= horizon + 8:
        raise ValueError("有效数据量不足，无法构造预测窗口")

    numeric_cols = [target_col, *features]
    work[numeric_cols] = work[numeric_cols].interpolate(limit_direction="both")
    work[numeric_cols] = work[numeric_cols].ffill().bfill()
    work = work.reset_index(drop=True)

    quality = {
        "input_rows": int(len(df)),
        "valid_rows": int(len(work)),
        "dropped_rows": int(len(df) - len(work)),
        "time_column": time_col,
        "target_column": target_col,
        "feature_columns": features,
    }
    return work, quality
