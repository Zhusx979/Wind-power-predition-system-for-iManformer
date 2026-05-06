from __future__ import annotations

import json
import os
import re
import urllib.error
import urllib.request
from typing import Any

import numpy as np
import pandas as pd
from app.core.config import settings as _settings  # Ensure backend/.env is loaded for direct imports.

HARDCODED_DEEPSEEK_API_KEY = "sk-6eabc327456b4a6ba4e65849baff08e9"


def analyze_with_domestic_model(df: pd.DataFrame, request: Any) -> dict[str, Any]:
    context = _build_context(df, request.prediction_result or {})
    question = (request.question or "").strip()
    prompt = _build_prompt(context, question)
    online_result = _call_deepseek(prompt)
    report = online_result.get("content") if online_result else None
    online_error = online_result.get("error") if online_result else "未配置 DEEPSEEK_API_KEY"
    if report:
        return {
            "provider": "DeepSeek Chat Completions",
            "model": os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash"),
            "mode": "online",
            "report": report,
            "context": context,
            "qa": _build_qa_pairs(context, question, report=report, mode="online"),
        }

    return {
        "provider": "Deepseek 分析",
        "model": "offline-rule-report",
        "mode": "offline",
        "report": _build_local_report(context),
        "context": context,
        "qa": _build_qa_pairs(context, question, mode="offline", online_error=online_error),
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


def _build_prompt(context: dict[str, Any], question: str = "") -> str:
    question_block = f"\n用户追问：{question}" if question else "\n用户未输入具体追问，请给出默认诊断。"
    return (
        "你是风电功率预测项目的 Deepseek 分析助手。请基于以下 JSON 数据，"
        "用中文输出结构化内容，必须包含 `## 回答` 和 `## 分析报告` 两个标题。"
        "`## 回答` 下直接回答用户问题；`## 分析报告` 下包含数据概况、模型表现、"
        "iManformer 优势、误差风险和工程建议。请避免空泛营销语，直接给出可执行结论。\n\n"
        f"{json.dumps(context, ensure_ascii=False)}"
        f"{question_block}"
    )


def _call_deepseek(prompt: str) -> dict[str, str] | None:
    api_key = os.getenv("DEEPSEEK_API_KEY") or HARDCODED_DEEPSEEK_API_KEY
    if not api_key:
        return None

    url = os.getenv("DEEPSEEK_BASE_URL", "https://api.deepseek.com/chat/completions")
    payload = {
        "model": os.getenv("DEEPSEEK_MODEL", "deepseek-v4-flash"),
        "messages": [
            {"role": "system", "content": "你是严谨的中文风电数据分析专家。"},
            {"role": "user", "content": prompt},
        ],
        "thinking": {"type": "disabled"},
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
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore").strip()
        return {"error": f"HTTP {exc.code}{f': {detail[:180]}' if detail else ''}"}
    except urllib.error.URLError as exc:
        return {"error": f"网络请求失败：{exc.reason}"}
    except TimeoutError:
        return {"error": "请求 DeepSeek 超时"}
    except (json.JSONDecodeError, KeyError):
        return {"error": "DeepSeek 返回内容解析失败"}

    message = body.get("choices", [{}])[0].get("message", {})
    content = message.get("content")
    if not content:
        return {"error": "DeepSeek 未返回有效 content"}
    return {"content": content}

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
            "## 分析报告",
            f"- 数据规模：共 {context.get('rows', 0)} 行，目标列为 `{context.get('target_column') or '未显式指定'}`。",
            f"- 出力概况：平均功率约 {mean_power:.3f} MW，容量代理值约 {capacity:.3f} MW，{load_level}。",
            f"- 模型表现：当前最优模型为 {best_model}，RMSE={rmse}，MAE={mae}，曲线贴合程度优于其他基线模型。",
            f"- 风险判断：{risk}",
            "- 工程建议：保留风速、风向、温度等气象特征；对极端爬坡、限电和异常停机时段单独打标；上线时建议按日滚动复核 MAE/RMSE/R2。",
            "- 结论：iManformer 适合作为当前演示系统的主推模型，建议在真实部署阶段继续接入训练权重和在线校准模块。",
        ]
    )


def _extract_answer_from_report(report: str | None) -> str | None:
    if not report:
        return None

    match = re.search(
        r"^\s*#{1,6}\s*回答(?:[:：]\s*(.*))?\s*$([\s\S]*?)(?=^\s*#{1,6}\s+|\Z)",
        report,
        flags=re.MULTILINE,
    )
    if match:
        inline_answer = (match.group(1) or "").strip()
        block_answer = "\n".join(
            line.strip().lstrip("- ").strip()
            for line in match.group(2).splitlines()
            if line.strip()
        ).strip()
        return inline_answer or block_answer or None

    lines = [line.strip() for line in report.splitlines() if line.strip()]
    answer_lines: list[str] = []
    for line in lines:
        if re.match(r"^\s*#{1,6}\s*分析报告", line):
            break
        if re.match(r"^\s*#{1,6}\s*", line):
            continue
        answer_lines.append(line.lstrip("- ").strip())
    if answer_lines:
        return "\n".join(answer_lines).strip()
    return None


def _build_offline_answer(context: dict[str, Any], question: str, online_error: str | None = None) -> str:
    best_model = context.get("best_model") or "iManformer"
    rmse = context.get("best_rmse")
    mae = context.get("best_mae")
    reason = online_error or "在线接口暂不可用"
    return (
        f"当前未获取到 DeepSeek 在线回答（{reason}）。"
        f"本地诊断显示 {best_model} 暂时是综合误差最低的模型，RMSE={rmse}，MAE={mae}。"
        f"如果你要追问“{question[:120]}”，请先检查后端 DeepSeek 配置和网络连通性，恢复在线接口后即可返回真实 AI 回答。"
    )


def _build_qa_pairs(
    context: dict[str, Any],
    question: str | None,
    report: str | None = None,
    mode: str = "offline",
    online_error: str | None = None,
) -> dict[str, Any]:
    best_model = context.get("best_model") or "iManformer"
    if question:
        answer = (
            _extract_answer_from_report(report) or report
            if mode == "online"
            else _build_offline_answer(context, question, online_error)
        )
        return {
            "question": question,
            "answer": answer,
            "references": (
                ["DeepSeek 在线回答", "模型评估指标", "误差分析", "气象上下文"]
                if mode == "online"
                else ["本地诊断", "模型评估指标", "误差分析"]
            ),
        }

    return {
        "question": "",
        "answer": (
            f"当前已生成默认诊断：{best_model} 在本次预测中表现最好。"
            "请重点关注误差曲线的峰值时段、风速风向快速变化区间，以及原始数据中的缺测或异常点。"
        ),
        "references": ["预测结果诊断", "模型评估指标", "误差分析"],
    }
