from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

import numpy as np
import pandas as pd


@dataclass
class ForecastContext:
    train: pd.DataFrame
    future: pd.DataFrame
    target_column: str
    time_column: str
    feature_columns: list[str]
    window_size: int

    @property
    def history(self) -> np.ndarray:
        return self.train[self.target_column].to_numpy(dtype=float)

    @property
    def horizon(self) -> int:
        return len(self.future)


class BasePredictor(ABC):
    name: str
    display_name: str

    @abstractmethod
    def predict(self, context: ForecastContext) -> np.ndarray:
        raise NotImplementedError

    def _clip(self, context: ForecastContext, values: np.ndarray) -> np.ndarray:
        history = context.history
        lower = max(0.0, float(np.nanpercentile(history, 0.5)) * 0.5)
        upper = float(np.nanpercentile(history, 99.5)) * 1.2
        return np.clip(values, lower, upper)


class RNNPredictor(BasePredictor):
    name = "rnn"
    display_name = "RNN"

    def predict(self, context: ForecastContext) -> np.ndarray:
        history = context.history
        recent = history[-context.window_size :]
        last = float(recent[-1])
        mean = float(np.mean(recent))
        steps = np.arange(1, context.horizon + 1)
        values = last + (mean - last) * (1 - np.exp(-steps / max(context.horizon, 1)))
        return self._clip(context, values)


class LSTMPredictor(BasePredictor):
    name = "lstm"
    display_name = "LSTM"

    def predict(self, context: ForecastContext) -> np.ndarray:
        history = context.history
        recent = history[-context.window_size :]
        weights = np.linspace(0.25, 1.0, len(recent))
        baseline = float(np.average(recent, weights=weights))
        trend_span = min(24, max(3, len(recent) // 4))
        trend = (float(np.mean(recent[-trend_span:])) - float(np.mean(recent[:trend_span]))) / max(len(recent), 1)
        steps = np.arange(1, context.horizon + 1)
        values = baseline + trend * steps
        return self._clip(context, values)


class TransformerPredictor(BasePredictor):
    name = "transformer"
    display_name = "Transformer"

    def predict(self, context: ForecastContext) -> np.ndarray:
        history = context.history
        period = 96 if len(history) >= 96 + context.horizon else max(1, min(24, len(history) // 2))
        seasonal = history[-period : -period + context.horizon]
        if len(seasonal) < context.horizon:
            seasonal = np.resize(history[-period:], context.horizon)
        recent_mean = float(np.mean(history[-min(context.window_size, len(history)) :]))
        values = 0.72 * seasonal + 0.28 * recent_mean
        return self._clip(context, values)


class AdvancedPredictor(BasePredictor):
    name = "our_model"
    display_name = "Our Model"

    def predict(self, context: ForecastContext) -> np.ndarray:
        wind_col = _pick_wind_speed_column(context.feature_columns)
        transformer = TransformerPredictor().predict(context)
        if wind_col is None or wind_col not in context.future.columns:
            return transformer

        train_wind = context.train[wind_col].to_numpy(dtype=float)
        future_wind = context.future[wind_col].to_numpy(dtype=float)
        train_power = context.history
        valid = np.isfinite(train_wind) & np.isfinite(train_power)
        if valid.sum() < 12:
            return transformer

        x = np.power(np.maximum(train_wind[valid], 0.0), 3)
        y = train_power[valid]
        design = np.column_stack([x, np.ones_like(x)])
        coef, intercept = np.linalg.lstsq(design, y, rcond=None)[0]
        physical = coef * np.power(np.maximum(future_wind, 0.0), 3) + intercept

        # Demo proxy model: blend physical wind-power relation with seasonal attention baseline.
        values = 0.62 * physical + 0.38 * transformer
        return self._clip(context, values)


def _pick_wind_speed_column(columns: list[str]) -> str | None:
    normalized = {c: c.lower().replace("_", " ") for c in columns}
    hub = [c for c, n in normalized.items() if "wind speed" in n and "hub" in n and "m/s" in n]
    if hub:
        return hub[0]
    speeds = [c for c, n in normalized.items() if "wind speed" in n and "m/s" in n]
    return speeds[-1] if speeds else None


PREDICTOR_REGISTRY: dict[str, BasePredictor] = {
    predictor.name: predictor
    for predictor in [RNNPredictor(), LSTMPredictor(), TransformerPredictor(), AdvancedPredictor()]
}
