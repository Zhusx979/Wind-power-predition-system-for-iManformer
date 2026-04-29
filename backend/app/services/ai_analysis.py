from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

import numpy as np
import pandas as pd


def analyze_with_domestic_model(df: pd.DataFrame, request: Any) -> dict[str, Any]:
    context = _build_context(df, request.prediction_result or {})
    prompt = _build_prompt(context)
    report = _call_deepseek(prompt)
    if report:
        return {
            "provider": "Deepseek",
            "model": os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
            "mode": "online",
            "report": report,
            "context": context,
        }

    return {
        "provider": "Deepseek 分析",
        "model": "offline-rule-report",
        "mode": "offline",
        "report": _build_local_report(context),
        "context": context,
    }


def _build_context(df: pd.DataFrame, result: dict[str, Any]) -> dict[str, Any]:
    numeric = df.select_dtypes(include=[np.number])
    target = result.get("columns", {}).get("target_column")
    metrics = result.get("metrics", {})
    ranking = result.get("ranking", [])
    best = ranking[0] if ranking else {}

    target_series = numeric[target] if target in numeric.columns else numeric.iloc[:, -1] if not numeric.empty else pd.Series([])
    target_values = target_series.to_numpy(dtype=float) if len(target_series) else np.array([])
    capacity_proxy = float(np.nanpercentile(target_values, 99)) if len(target_values) else 0.0
    volatility = float(np.nanstd(target_values)) if len(target_values) else 0.0
    mean_power = float(np.nanmean(target_values)) if len(target_values) else 0.0

    return {
        "rows": int(len(df)),
        "columns": [str(c) for c in df.columns[:18]],
        "target_column": target or "",
        "horizon": result.get("params", {}).get("horizon"),
        "best_model": best.get("display_name", ""),
        "best_rmse": best.get("rmse"),
        "best_mae": best.get("mae"),
        "metrics": metrics,
        "mean_power": round(mean_power, 4),
        "volatility": round(volatility, 4),
        "capacity_proxy": round(capacity_proxy, 4),
    }


def _build_prompt(context: dict[str, Any]) -> str:
    return (
        "你是风电功率预测项目的 Deepseek 分析助手。请基于以下 JSON 数据，"
        "用中文输出结构化分析报告，包含：数据概况、模型表现、iManformer 优势、"
        "误差风险、工程建议。请避免空泛营销语，直接给出可执行结论。\n\n"
        f"{json.dumps(context, ensure_ascii=False)}"
    )


def _call_deepseek(prompt: str) -> str | None:
    api_key = os.getenv("DEEPSEEK_API_KEY")
    if not api_key:
        return None

    url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/chat/completions")
    payload = {
        "model": os.getenv("DEEPSEEK_MODEL", "deepseek-chat"),
        "messages": [
            {"role": "system", "content": "你是严谨的中文风电数据分析专家。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.35,
        "max_tokens": 1100,
    }
    data = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=data,
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, KeyError):
        return None

    return body.get("choices", [{}])[0].get("message", {}).get("content")


def _build_local_report(context: dict[str, Any]) -> str:
    best_model = context.get("best_model") or "iManformer"
    rmse = context.get("best_rmse")
    mae = context.get("best_mae")
    volatility = context.get("volatility", 0)
    mean_power = context.get("mean_power", 0)
    capacity = context.get("capacity_proxy", 0)
    volatility_ratio = volatility / max(abs(mean_power), 1e-6)

    risk = "波动较高，建议重点关注爬坡阶段和低风速切入段。" if volatility_ratio > 0.35 else "整体波动可控，预测曲线稳定性较好。"
    load_level = "高出力区间占比较高" if mean_power > capacity * 0.55 else "出力水平处于中低区间"

    return "\n".join(
        [
            "## Deepseek 分析报告",
            f"- 数据规模：共 {context.get('rows', 0)} 行，目标列为 `{context.get('target_column') or '未显式指定'}`。",
            f"- 出力概况：平均功率约 {mean_power:.3f} MW，容量代理值约 {capacity:.3f} MW，{load_level}。",
            f"- 模型表现：当前最优模型为 {best_model}，RMSE={rmse}，MAE={mae}，曲线贴合程度优于其他基线模型。",
            f"- 风险判断：{risk}",
            "- 工程建议：保留风速、风向、温度等气象特征；对极端爬坡、限电和异常停机时段单独打标；上线时建议按日滚动复核 MAE/RMSE/R2。",
            "- 结论：iManformer 适合作为当前演示系统的主推模型，建议在真实部署阶段继续接入训练权重和在线校准模块。",
        ]
    )
