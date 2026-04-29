from __future__ import annotations

from typing import Any

import numpy as np
import pandas as pd

from app.services.metrics import regression_metrics
from app.services.predictors import ForecastContext, PREDICTOR_REGISTRY
from app.services.preprocessor import prepare_forecast_frame


def run_prediction(df: pd.DataFrame, request: Any, source: dict[str, Any]) -> dict[str, Any]:
    work, quality = prepare_forecast_frame(
        df=df,
        time_column=request.time_column,
        target_column=request.target_column,
        feature_columns=request.feature_columns,
        horizon=request.horizon,
    )

    horizon = min(request.horizon, len(work) - 8)
    train = work.iloc[:-horizon].copy()
    future = work.iloc[-horizon:].copy()
    context = ForecastContext(
        train=train,
        future=future,
        target_column=quality["target_column"],
        time_column=quality["time_column"],
        feature_columns=quality["feature_columns"],
        window_size=min(request.window_size, len(train)),
    )

    y_true = future[context.target_column].to_numpy(dtype=float)
    requested_models = request.models or list(PREDICTOR_REGISTRY)
    predictions: dict[str, dict[str, Any]] = {}
    metrics: dict[str, dict[str, float]] = {}

    for model_name in requested_models:
        if model_name not in PREDICTOR_REGISTRY:
            raise ValueError(f"未知模型: {model_name}")
        predictor = PREDICTOR_REGISTRY[model_name]
        values = predictor.predict(context)
        if len(values) != horizon:
            raise ValueError(f"模型 {model_name} 返回长度异常")
        values = np.asarray(values, dtype=float)
        predictions[model_name] = {
            "name": predictor.name,
            "display_name": predictor.display_name,
            "values": [round(float(v), 4) for v in values],
        }
        metrics[model_name] = regression_metrics(y_true, values)

    ranking = sorted(
        (
            {
                "model": model_name,
                "display_name": predictions[model_name]["display_name"],
                "rmse": model_metrics["RMSE"],
                "mae": model_metrics["MAE"],
                "r2": model_metrics["R2"],
            }
            for model_name, model_metrics in metrics.items()
        ),
        key=lambda item: (item["rmse"], item["mae"]),
    )

    timestamps = [pd.Timestamp(v).strftime("%Y-%m-%d %H:%M") for v in future[context.time_column]]
    chart_rows = []
    for index, timestamp in enumerate(timestamps):
        row = {"time": timestamp, "actual": round(float(y_true[index]), 4)}
        for model_name, payload in predictions.items():
            row[model_name] = payload["values"][index]
            row[f"{model_name}_error"] = round(payload["values"][index] - row["actual"], 4)
        chart_rows.append(row)

    summary = _build_summary(ranking)
    return {
        "source": {
            "file_id": source["file_id"],
            "source_name": source["source_name"],
            "rows": source["rows"],
        },
        "columns": quality,
        "params": {
            "window_size": context.window_size,
            "horizon": horizon,
            "models": requested_models,
        },
        "actual": [round(float(v), 4) for v in y_true],
        "timestamps": timestamps,
        "predictions": predictions,
        "metrics": metrics,
        "ranking": ranking,
        "chart_data": chart_rows,
        "summary": summary,
    }


def _build_summary(ranking: list[dict[str, Any]]) -> dict[str, str]:
    best = ranking[0] if ranking else None
    if not best:
        return {"best_model": "", "message": "暂无可用模型结果"}
    label = best["display_name"]
    if best["model"] == "our_model":
        message = "Our Model 在当前留出窗口中综合误差最低，适合用于演示高亮。"
    else:
        message = f"{label} 在当前留出窗口中暂时领先，可继续接入真实权重优化 Our Model。"
    return {"best_model": best["model"], "message": message}
