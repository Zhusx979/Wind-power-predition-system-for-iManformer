from __future__ import annotations

import pandas as pd
from types import SimpleNamespace

from app.services.predict_service import run_prediction


def test_run_prediction_on_minimal_frame():
    rows = 140
    df = pd.DataFrame(
        {
            "Time(year-month-day h:m:s)": pd.date_range("2024-01-01", periods=rows, freq="15min"),
            "Wind speed - at the height of wheel hub(m/s)": [6 + (i % 24) * 0.1 for i in range(rows)],
            "Power (MW)": [20 + (i % 24) * 0.7 for i in range(rows)],
        }
    )
    result = run_prediction(
        df,
        SimpleNamespace(
            file_id="demo",
            target_column=None,
            time_column=None,
            feature_columns=None,
            horizon=24,
            window_size=48,
            models=["rnn", "lstm", "transformer", "our_model"],
        ),
        {"file_id": "demo", "source_name": "demo.xlsx", "rows": rows},
    )

    assert len(result["chart_data"]) == 24
    assert "our_model" in result["metrics"]
