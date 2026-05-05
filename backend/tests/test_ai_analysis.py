from __future__ import annotations

from types import SimpleNamespace

import pandas as pd

from app.services.ai_analysis import analyze_with_domestic_model
from app.services.predict_service import run_prediction


def test_analysis_returns_report_and_qa(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)

    rows = 140
    frame = pd.DataFrame(
        {
            "Time(year-month-day h:m:s)": pd.date_range("2024-01-01", periods=rows, freq="15min"),
            "Wind speed - at the height of wheel hub(m/s)": [6 + (i % 24) * 0.1 for i in range(rows)],
            "Power (MW)": [20 + (i % 24) * 0.7 for i in range(rows)],
        }
    )
    prediction = run_prediction(
        frame,
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

    analysis = analyze_with_domestic_model(frame, SimpleNamespace(prediction_result=prediction, question="为什么误差会上升？"))

    assert analysis["report"]
    assert "thinking" not in analysis
    assert "reasoning" not in analysis
    assert analysis["qa"]["question"] == "为什么误差会上升？"
    assert analysis["qa"]["answer"]
    assert analysis["mode"] in {"offline", "online"}
