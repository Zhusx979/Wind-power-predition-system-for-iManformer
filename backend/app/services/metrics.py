from __future__ import annotations

import numpy as np


def regression_metrics(y_true: np.ndarray, y_pred: np.ndarray) -> dict[str, float]:
    y_true = np.asarray(y_true, dtype=float)
    y_pred = np.asarray(y_pred, dtype=float)
    error = y_pred - y_true
    abs_error = np.abs(error)

    mae = float(np.mean(abs_error))
    mse = float(np.mean(error**2))
    rmse = float(np.sqrt(mse))
    denominator = np.where(np.abs(y_true) < 1e-8, np.nan, np.abs(y_true))
    mape = float(np.nanmean(abs_error / denominator) * 100)
    smape = float(np.mean(2 * abs_error / (np.abs(y_true) + np.abs(y_pred) + 1e-8)) * 100)
    total = float(np.sum((y_true - np.mean(y_true)) ** 2))
    r2 = 1.0 - float(np.sum(error**2)) / total if total > 1e-12 else 0.0

    return {
        "MAE": round(mae, 4),
        "RMSE": round(rmse, 4),
        "MAPE": round(0.0 if np.isnan(mape) else mape, 4),
        "R2": round(r2, 4),
        "MSE": round(mse, 4),
        "SMAPE": round(smape, 4),
        "Max Error": round(float(np.max(abs_error)), 4),
    }
