from __future__ import annotations

import json
from types import SimpleNamespace

import pandas as pd

import app.services.ai_analysis as ai_analysis
from app.services.ai_analysis import _extract_answer_from_report, analyze_with_domestic_model
from app.services.predict_service import run_prediction


def test_analysis_returns_report_and_qa(monkeypatch):
    monkeypatch.delenv("DEEPSEEK_API_KEY", raising=False)
    monkeypatch.setattr(ai_analysis, "DEEPSEEK_API_KEY", "")

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
    assert "误差升高通常和风速风向快速变化" in analysis["qa"]["answer"]
    assert "在线 DeepSeek 未接通" in analysis["qa"]["answer"]
    assert analysis["mode"] in {"offline", "online"}


def test_extract_answer_from_structured_report():
    report = """## 回答
- 当前功率整体呈先升后降趋势，误差主要集中在爬坡区间。

## 分析报告
- 这里是详细报告。
"""

    assert _extract_answer_from_report(report) == "当前功率整体呈先升后降趋势，误差主要集中在爬坡区间。"


def test_extract_answer_before_report_heading():
    report = """风电功率整体呈周期性波动，高风速时段输出更高。

## 分析报告
- 这里是详细报告。
"""

    assert _extract_answer_from_report(report) == "风电功率整体呈周期性波动，高风速时段输出更高。"


def test_deepseek_call_uses_current_model_and_ignores_system_proxy(monkeypatch):
    captured = {}

    class FakeResponse:
        def __enter__(self):
            return self

        def __exit__(self, *_):
            return False

        def read(self):
            return b'{"choices":[{"message":{"content":"## \\u56de\\u7b54\\n- ok"}}]}'

    class FakeOpener:
        def open(self, request, timeout):
            captured["timeout"] = timeout
            captured["url"] = request.full_url
            captured["payload"] = json.loads(request.data.decode("utf-8"))
            captured["authorization"] = request.get_header("Authorization")
            return FakeResponse()

    def fake_build_opener(*handlers):
        captured["handlers"] = handlers
        return FakeOpener()

    monkeypatch.setenv("DEEPSEEK_API_KEY", "sk-test")
    monkeypatch.delenv("DEEPSEEK_MODEL", raising=False)
    monkeypatch.delenv("DEEPSEEK_USE_SYSTEM_PROXY", raising=False)
    monkeypatch.setattr(ai_analysis.urllib.request, "build_opener", fake_build_opener)

    result = ai_analysis._call_deepseek("hello")

    assert result == {"content": "## 回答\n- ok"}
    assert captured["url"] == "https://api.deepseek.com/chat/completions"
    assert captured["payload"]["model"] == "deepseek-chat"
    assert captured["authorization"] == "Bearer sk-test"
    assert captured["handlers"]
    assert isinstance(captured["handlers"][0], ai_analysis.urllib.request.ProxyHandler)


def test_deepseek_endpoint_accepts_base_url(monkeypatch):
    monkeypatch.setenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com")

    assert ai_analysis._get_deepseek_endpoint() == "https://api.deepseek.com/chat/completions"
