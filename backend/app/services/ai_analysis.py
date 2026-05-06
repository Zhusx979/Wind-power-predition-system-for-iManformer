from __future__ import annotations

import json
import os
import re
import socket
import ssl
import urllib.error
import urllib.request
from typing import Any

import numpy as np
import pandas as pd
from app.core.config import settings as _settings  # Ensure backend/.env is loaded for direct imports.

DEFAULT_DEEPSEEK_MODEL = "deepseek-chat"
DEEPSEEK_API_KEY = "sk-59ee22cb06f44fae87854c0a8c58c9ce"


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
            "model": _get_deepseek_model(),
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
    api_key = _get_deepseek_api_key()
    if not api_key:
        return None

    url = _get_deepseek_endpoint()
    payload = {
        "model": _get_deepseek_model(),
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
        opener = _build_url_opener()
        with opener.open(request, timeout=25) as response:
            body = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="ignore").strip()
        return {"error": f"HTTP {exc.code}{f': {detail[:180]}' if detail else ''}"}
    except urllib.error.URLError as exc:
        return {"error": f"网络请求失败：{exc.reason}"}
    except (TimeoutError, socket.timeout):
        return {"error": "请求 DeepSeek 超时"}
    except ssl.SSLError as exc:
        return {"error": f"SSL 连接失败：{exc}"}
    except (json.JSONDecodeError, KeyError):
        return {"error": "DeepSeek 返回内容解析失败"}

    message = body.get("choices", [{}])[0].get("message", {})
    content = message.get("content")
    if not content:
        return {"error": "DeepSeek 未返回有效 content"}
    return {"content": content}


def _get_deepseek_api_key() -> str:
    return (os.getenv("DEEPSEEK_API_KEY") or DEEPSEEK_API_KEY).strip()


def _get_deepseek_model() -> str:
    return (os.getenv("DEEPSEEK_MODEL") or DEFAULT_DEEPSEEK_MODEL).strip()


def _get_deepseek_endpoint() -> str:
    configured = (os.getenv("DEEPSEEK_API_URL") or os.getenv("DEEPSEEK_BASE_URL") or "").strip().rstrip("/")
    if not configured:
        return "https://api.deepseek.com/chat/completions"
    if configured.endswith("/chat/completions"):
        return configured
    return f"{configured}/chat/completions"


def _build_url_opener() -> urllib.request.OpenerDirector:
    use_system_proxy = os.getenv("DEEPSEEK_USE_SYSTEM_PROXY", "").strip().lower() in {"1", "true", "yes", "on"}
    if use_system_proxy:
        return urllib.request.build_opener()
    return urllib.request.build_opener(urllib.request.ProxyHandler({}))


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
    normalized_question = question.strip().lower()

    if "什么模型" in normalized_question or "你是谁" in normalized_question or "what model" in normalized_question:
        core_answer = (
            "我是本系统内置的风电功率预测分析助手。在线接口可用时会调用 DeepSeek Chat Completions；"
            "当前由本地规则诊断模块基于预测结果、误差指标和气象特征生成回答。"
        )
    elif "优势" in normalized_question or "imanformer" in normalized_question:
        core_answer = (
            f"当前结果中 {best_model} 综合误差最低，RMSE={rmse}，MAE={mae}。"
            "它的展示优势主要体现在对功率趋势的跟随更稳定、误差峰值更低，并且在多模型对比中更适合作为主推预测曲线。"
        )
    elif "误差" in normalized_question or "为什么" in normalized_question:
        core_answer = (
            f"本地诊断显示 {best_model} 暂时是综合误差最低的模型，RMSE={rmse}，MAE={mae}。"
            "误差升高通常和风速风向快速变化、功率爬坡段、异常限电或原始数据缺测有关；建议重点查看误差柱状图峰值对应的时间段。"
        )
    elif "因素" in normalized_question or "影响" in normalized_question:
        core_answer = (
            "影响风电功率预测的主要因素包括轮毂高度风速、风向、温度、湿度和气压。"
            "其中风速通常贡献最大，风向突变和温度变化会影响机组运行状态与空气密度，从而放大局部预测误差。"
        )
    else:
        core_answer = (
            f"结合当前预测结果，{best_model} 暂时表现最好，RMSE={rmse}，MAE={mae}。"
            "整体应重点关注真实功率曲线与预测曲线的偏离区间，并结合风速、风向和温度变化判断误差来源。"
        )

    return (
        f"{core_answer}"
        f"\n\n在线 DeepSeek 未接通：{reason}。配置 DEEPSEEK_API_KEY 且网络可访问后，将自动切换为在线回答。"
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
