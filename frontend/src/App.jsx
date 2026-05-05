import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { runAnalysis, runPredict, uploadDataset, listSamples, loadSample } from "./api";

const MODEL_META = {
  rnn: { label: "RNN", color: "#7ca4b1" },
  lstm: { label: "LSTM", color: "#3b83a2" },
  transformer: { label: "Transformer", color: "#20c8f5" },
  our_model: { label: "iManformer", color: "#7fffd4" },
};

const NAV_ITEMS = [
  { key: "load", label: "数据加载" },
  { key: "forecast", label: "预测结果" },
  { key: "analysis", label: "DeepSeek分析" },
];

const DEFAULT_MODELS = Object.keys(MODEL_META);
const SAMPLE_QUESTIONS = [
  "为什么 08:00-10:00 误差会上升？",
  "未来 24 小时哪些气象因素影响最大？",
  "iManformer 相比其他模型优势在哪里？",
  "如何降低高风速区间的预测误差？",
];

function formatNumber(value, digits = 2) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toFixed(digits);
}

function hasValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function formatCount(value) {
  if (!hasValue(value)) return "--";
  const number = Number(value);
  if (Number.isFinite(number)) return number.toLocaleString();
  return String(value);
}

function inferColumnCount(summary) {
  if (hasValue(summary?.column_count)) return summary.column_count;
  if (Array.isArray(summary?.columns)) return summary.columns.length;
  if (Array.isArray(summary?.preview_columns)) return summary.preview_columns.length;
  if (summary?.preview?.[0]) return Object.keys(summary.preview[0]).length;
  return null;
}

function parseTimeValue(value) {
  if (!hasValue(value)) return null;
  const text = String(value).trim();
  const normalized = /^\d{4}-\d{2}-\d{2}\s/.test(text) ? text.replace(" ", "T") : text;
  const time = new Date(normalized).getTime();
  return Number.isNaN(time) ? null : time;
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const render = (value) => (Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, ""));
  if (seconds >= 3600) return `${render(seconds / 3600)} 小时`;
  if (seconds >= 60) return `${render(seconds / 60)} 分钟`;
  return `${render(seconds)} 秒`;
}

function inferSampleInterval(summary, timeColumn) {
  if (hasValue(summary?.sample_interval)) return summary.sample_interval;
  if (!timeColumn || !summary?.preview?.length) return null;
  const times = summary.preview
    .map((row) => parseTimeValue(row?.[timeColumn]))
    .filter((time) => time !== null)
    .sort((a, b) => a - b);
  const deltas = [];
  for (let index = 1; index < times.length; index += 1) {
    const deltaSeconds = (times[index] - times[index - 1]) / 1000;
    if (deltaSeconds > 0) deltas.push(deltaSeconds);
  }
  if (!deltas.length) return null;
  deltas.sort((a, b) => a - b);
  const middle = Math.floor(deltas.length / 2);
  const median = deltas.length % 2 ? deltas[middle] : (deltas[middle - 1] + deltas[middle]) / 2;
  return formatDuration(median);
}

function formatDate(value) {
  if (!value) return "--";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatLabel(key) {
  const normalized = String(key ?? "").trim().replace(/\s+/g, " ");
  const map = {
    "Time(year-month-day h:m:s)": "时间",
    "Power (MW)": "功率(MW)",
    "Wind speed at height of 10 meters (m/s)": "10m风速",
    "Wind direction at height of 10 meters (˚)": "10m风向",
    "Wind speed at height of 30 meters (m/s)": "30m风速",
    "Wind direction at height of 30 meters (˚)": "30m风向",
    "Wind speed at height of 50 meters (m/s)": "50m风速",
    "Wind direction at height of 50 meters (˚)": "50m风向",
    "Wind speed - at the height of wheel hub(m/s)": "轮毂风速",
    "Wind speed - at the height of wheel hub (m/s)": "轮毂风速",
    "Wind speed - at the height of wheel hub (˚)": "轮毂风向",
    "Air temperature (°C)": "温度(°C)",
    "Atmosphere (hpa)": "气压(hPa)",
    "Atmosphere (hPa)": "气压(hPa)",
    "Relative humidity (%)": "湿度(%)",
  };
  return map[normalized] || key;
}

function normalizeForecastData(result) {
  if (!result?.chart_data?.length) return [];
  return result.chart_data.map((row) => ({
    time: row.time,
    actual: row.actual,
    rnn: row.rnn,
    lstm: row.lstm,
    transformer: row.transformer,
    our_model: row.our_model,
    our_model_error: row.our_model_error,
  }));
}

function normalizeAnalysisResult(result, question) {
  if (!result) return null;
  const qa = result.qa || {};
  return {
    ...result,
    provider: result.provider || "DeepSeek Chat Completions",
    mode: result.mode || "offline",
    model: result.model || "deepseek-v4-flash",
    qa: {
      question: qa.question || question || "",
      answer: qa.answer || "当前分析已返回，但暂无可展示的问答内容。",
      references: Array.isArray(qa.references) ? qa.references : [],
    },
  };
}

function StatCard({ title, value, detail, tone = "default" }) {
  return (
    <article className={`stat-card ${tone}`}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function SectionTitle({ kicker, title, note }) {
  return (
    <div className="section-title">
      <span>{kicker}</span>
      <div>
        <h2>{title}</h2>
        {note ? <p>{note}</p> : null}
      </div>
    </div>
  );
}

function DataPreviewTable({ rows, scrollable = false }) {
  const columns = useMemo(() => {
    if (!rows?.length) return [];
    return Object.keys(rows[0]);
  }, [rows]);

  if (!rows?.length) {
    return <div className="empty-state">加载样例或上传文件后，这里会显示前几行数据。</div>;
  }

  return (
    <div className={scrollable ? "table-shell scrollable" : "table-shell"}>
      <table>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column}>{formatLabel(column)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {columns.map((column) => (
                <td key={column}>{String(row[column] ?? "--")}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ReportMarkdown({ content }) {
  if (!content) return <div className="empty-state">完成预测后再生成分析报告，这里会显示结构化诊断结论。</div>;
  const lines = String(content).split("\n");
  return (
    <div className="report-body">
      {lines.map((line, index) => {
        if (line.startsWith("## ")) return <h3 key={index}>{line.slice(3)}</h3>;
        if (line.startsWith("- ")) return <p key={index} className="report-item">{line.slice(2)}</p>;
        return line.trim() ? <p key={index}>{line}</p> : <br key={index} />;
      })}
    </div>
  );
}

function App() {
  const [activePage, setActivePage] = useState("start");
  const [samples, setSamples] = useState([]);
  const [selectedSample, setSelectedSample] = useState("");
  const [dataset, setDataset] = useState(null);
  const [predictResult, setPredictResult] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [horizon, setHorizon] = useState(24);
  const [windowSize, setWindowSize] = useState(96);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [analysisQuestion, setAnalysisQuestion] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState(SAMPLE_QUESTIONS[0]);
  const [dataStatus, setDataStatus] = useState("正在加载样例数据...");
  const [chartWindow, setChartWindow] = useState({ start: 0, end: null });
  const [zoomDraft, setZoomDraft] = useState(null);
  const [chartView, setChartView] = useState("normal");
  const controllerRef = useRef(null);
  const analysisControllerRef = useRef(null);
  const dragRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    listSamples({ signal: controller.signal })
      .then((data) => {
        const nextSamples = data.samples || [];
        setSamples(nextSamples);
        setSelectedSample(nextSamples[0] || "");
        setDataStatus(nextSamples.length ? "" : "数据目录中没有可用样例文件");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setDataStatus(error.message || "样例加载失败");
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setChartWindow({ start: 0, end: null });
    setZoomDraft(null);
  }, [predictResult]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        setChartView("normal");
        setZoomDraft(null);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const withLoading = async (task, onDone) => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    setLoading(true);
    setMessage(task);
    try {
      await onDone(controllerRef.current.signal);
    } catch (error) {
      if (error.name !== "AbortError") setMessage(error.message || "操作失败");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSample = () => {
    if (!selectedSample) return;
    withLoading("正在加载样例数据...", async (signal) => {
      const data = await loadSample(selectedSample, { signal });
      setDataset(data);
      setPredictResult(null);
      setAnalysisResult(null);
      setActivePage("load");
      setMessage(`已加载样例：${data.source_name}`);
    });
  };

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    withLoading("正在上传并解析数据...", async (signal) => {
      const data = await uploadDataset(file, { signal });
      setDataset(data);
      setPredictResult(null);
      setAnalysisResult(null);
      setActivePage("load");
      setMessage(`已上传：${data.source_name}`);
    });
  };

  const handlePredict = () => {
    if (!dataset?.file_id) {
      setMessage("请先加载样例数据或上传文件");
      return;
    }
    withLoading("正在执行多模型预测...", async (signal) => {
      const data = await runPredict(
        {
          file_id: dataset.file_id,
          target_column: dataset.inferred?.target_column,
          time_column: dataset.inferred?.time_column,
          feature_columns: dataset.inferred?.feature_columns,
          window_size: Number(windowSize),
          horizon: Number(horizon),
          models: DEFAULT_MODELS,
        },
        { signal },
      );
      setPredictResult(data);
      setAnalysisResult(null);
      setActivePage("forecast");
      setMessage(data.summary?.message || "预测完成");
    });
  };

  const handleAnalysis = (question = analysisQuestion) => {
    if (!dataset?.file_id || !predictResult) {
      setMessage("请先完成预测，再进入分析");
      return;
    }
    analysisControllerRef.current?.abort();
    analysisControllerRef.current = new AbortController();
    setAnalysisLoading(true);
    setMessage("");
    runAnalysis(
      {
        file_id: dataset.file_id,
        prediction_result: predictResult,
        provider: "deepseek",
        question,
      },
      { signal: analysisControllerRef.current.signal },
    )
      .then((data) => {
        const nextResult = normalizeAnalysisResult(data, question);
        setAnalysisResult(nextResult);
        setActivePage("analysis");
        setMessage(nextResult?.qa?.answer ? "分析结果已返回" : "分析完成");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setMessage(error.message || "分析失败");
      })
      .finally(() => setAnalysisLoading(false));
  };

  const datasetSummary = dataset || {};
  const inference = dataset?.inferred || {};
  const featureColumns = inference.feature_columns || [];
  const columnCount = inferColumnCount(datasetSummary);
  const sampleInterval = inferSampleInterval(datasetSummary, inference.time_column);
  const timeRange = datasetSummary.time_range
    ? `${formatDate(datasetSummary.time_range.start)} ~ ${formatDate(datasetSummary.time_range.end)}`
    : "--";
  const chartData = normalizeForecastData(predictResult);
  const visibleChart = useMemo(() => {
    const end = chartWindow.end ?? chartData.length;
    return chartData.slice(chartWindow.start, end);
  }, [chartData, chartWindow]);
  const chartPanelClass = [
    "panel",
    "chart-panel",
    chartView === "wide" ? "wide-chart" : "",
    chartView === "fullscreen" ? "fullscreen-chart" : "",
  ].filter(Boolean).join(" ");
  const chartHeight = chartView === "fullscreen" ? "100%" : chartView === "wide" ? 500 : 360;
  const visiblePointCount = visibleChart.length;
  const totalPointCount = chartData.length;
  const metricRows = DEFAULT_MODELS.map((model) => ({
    model: MODEL_META[model].label,
    MAE: predictResult?.metrics?.[model]?.MAE,
    RMSE: predictResult?.metrics?.[model]?.RMSE,
    MAPE: predictResult?.metrics?.[model]?.MAPE,
    R2: predictResult?.metrics?.[model]?.R2,
  }));
  const ranking = predictResult?.ranking || [];
  const bestModel = predictResult?.summary?.best_model || ranking[0]?.model;
  const ourMetrics = predictResult?.metrics?.our_model || {};
  const firstError = visibleChart[0]?.our_model_error ?? 0;
  const visibleRange = visibleChart.length ? `${visibleChart[0]?.time} - ${visibleChart[visibleChart.length - 1]?.time}` : "--";
  const currentStatus = loading
    ? "任务处理中"
    : analysisLoading
      ? "DeepSeek分析中"
      : analysisResult?.qa?.answer
        ? "分析结果已返回"
      : dataset?.file_id
        ? "系统运行正常"
        : "等待数据导入";

  const handleChartMouseDown = (state, event) => {
    const button = event?.button ?? state?.event?.button ?? 0;
    if (button !== 0) return;
    const index = state?.activeTooltipIndex ?? state?.activeIndex;
    if (Number.isInteger(index)) {
      dragRef.current = true;
      setZoomDraft({ start: index, end: index });
    }
  };

  const handleChartMouseMove = (state) => {
    if (!dragRef.current || !zoomDraft) return;
    const index = state?.activeTooltipIndex ?? state?.activeIndex;
    if (Number.isInteger(index)) {
      setZoomDraft((current) => ({ ...current, end: index }));
    }
  };

  const handleChartMouseUp = () => {
    dragRef.current = false;
    if (!zoomDraft) return;
    const start = Math.min(zoomDraft.start, zoomDraft.end);
    const end = Math.max(zoomDraft.start, zoomDraft.end);
    if (end - start >= 2) {
      setChartWindow({
        start: chartWindow.start + start,
        end: chartWindow.start + end + 1,
      });
    }
    setZoomDraft(null);
  };

  const resetChart = () => {
    setChartWindow({ start: 0, end: null });
    setZoomDraft(null);
    setChartView("normal");
  };

  return (
    <main className="app-shell">
      <header className="topbar">
        <button className="brand" onClick={() => setActivePage("start")} type="button">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          <span>风力发电功率预测系统</span>
        </button>
        <nav className="module-nav" aria-label="模块导航">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.key}
              className={activePage === item.key ? "nav-chip active" : "nav-chip"}
              onClick={() => setActivePage(item.key)}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="run-status">
          <span />
          <strong>{currentStatus}</strong>
          <em>{datasetSummary.created_at ? formatDate(datasetSummary.created_at) : "未加载数据"}</em>
        </div>
      </header>

      {activePage === "start" && (
        <section className="start-screen">
          <div className="start-hero">
            <p className="hero-kicker">Wind Power Forecasting & Intelligent Analysis</p>
            <h1>风力发电功率预测系统</h1>
            <p className="hero-copy">基于多模型预测与 DeepSeek 分析的风电功率辅助决策平台。</p>
          </div>
          <div className="start-grid">
            <button className="start-card" onClick={() => setActivePage("load")} type="button">
              <span className="start-icon doc-icon" aria-hidden="true" />
              <span className="start-card-title">数据加载</span>
              <p>导入样例数据或上传本地风电数据，完成字段识别与数据预览。</p>
            </button>
            <button className="start-card" onClick={() => setActivePage("forecast")} type="button">
              <span className="start-icon chart-icon" aria-hidden="true" />
              <span className="start-card-title">预测结果</span>
              <p>查看模型预测曲线、指标对比与误差分析。</p>
            </button>
            <button className="start-card" onClick={() => setActivePage("analysis")} type="button">
              <span className="start-icon ai-icon" aria-hidden="true" />
              <span className="start-card-title">DeepSeek分析</span>
              <p>基于预测结果生成诊断报告、关键时刻说明和问答。</p>
            </button>
          </div>
          <div className="process-rail" aria-label="流程">
            <span>1</span>
            <strong>数据加载</strong>
            <i />
            <span>2</span>
            <strong>预测结果</strong>
            <i />
            <span>3</span>
            <strong>DeepSeek分析</strong>
          </div>
        </section>
      )}

      {activePage === "load" && (
        <section className="dashboard-page">
          <SectionTitle kicker="01" title="数据加载" note="导入样例或上传文件后，页面会自动识别时间列、目标列和气象特征列。" />
          <div className="load-stack">
            <div className="panel import-panel">
              <div className="panel-head">
                <h3>选择样例数据</h3>
              </div>
              <div className="control-row">
                <select value={selectedSample} onChange={(e) => setSelectedSample(e.target.value)} disabled={loading || !samples.length}>
                  {samples.length ? samples.map((item) => <option key={item} value={item}>{item}</option>) : <option value="">暂无样例</option>}
                </select>
                <button onClick={handleLoadSample} disabled={!selectedSample || loading}>加载样例</button>
              </div>
              <div className="upload-zone">
                <input accept=".csv,.xlsx,.xls" onChange={handleUpload} type="file" disabled={loading} />
                <p>支持 CSV / XLSX / XLS，首行需为列名。</p>
              </div>
              {dataStatus ? <p className="helper-line">{dataStatus}</p> : null}
              {message ? <p className="message-line">{message}</p> : null}
              <div className="predict-inline">
                <label>
                  预测步长
                  <input type="number" min="1" max="336" value={horizon} onChange={(e) => setHorizon(e.target.value)} />
                </label>
                <label>
                  窗口长度
                  <input type="number" min="8" max="2000" value={windowSize} onChange={(e) => setWindowSize(e.target.value)} />
                </label>
                <button onClick={handlePredict} disabled={!dataset || loading} type="button">
                  {loading ? "处理中..." : "开始预测"}
                </button>
              </div>
            </div>
            <div className="load-row">
              <div className="load-main-column">
                <div className="panel preview-panel">
                  <div className="panel-head">
                    <h3>数据预览</h3>
                    <span className="panel-head-tools">
                      <span>{datasetSummary.preview?.length ? `前 ${datasetSummary.preview.length} 行` : "暂无预览"}</span>
                    </span>
                  </div>
                  <DataPreviewTable rows={datasetSummary.preview || []} scrollable />
                </div>
                <div className="panel overview-panel">
                  <div className="panel-head">
                    <h3>数据概况</h3>
                  </div>
                  <div className="summary-grid">
                    <StatCard title="数据集" value={datasetSummary.source_name || "--"} detail="当前加载的数据文件" />
                    <StatCard title="记录数" value={formatCount(datasetSummary.rows)} detail="有效样本数量" />
                    <StatCard title="字段数" value={formatCount(columnCount)} detail="原始列总数" />
                    <StatCard title="采样间隔" value={sampleInterval || "--"} detail="由时间列自动推断" />
                  </div>
                </div>
              </div>
              <div className="panel fields-panel">
                <div className="panel-head">
                  <h3>字段识别结果</h3>
                </div>
                <div className="meta-list">
                  <div><span>时间列</span><strong title={inference.time_column || ""}>{formatLabel(inference.time_column) || "--"}</strong></div>
                  <div><span>目标列</span><strong title={inference.target_column || ""}>{formatLabel(inference.target_column) || "--"}</strong></div>
                </div>
                <div className="feature-stack">
                  <div className="feature-stack-head">
                    <span className="feature-stack-title">特征列</span>
                    <strong>{formatCount(featureColumns.length)}</strong>
                  </div>
                  {featureColumns.length ? (
                    <div className="feature-list">
                      {featureColumns.map((item) => <span key={item}>{formatLabel(item)}</span>)}
                    </div>
                  ) : (
                    <div className="feature-empty">暂无特征列</div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </section>
      )}

      {activePage === "forecast" && (
        <section className="dashboard-page">
          <SectionTitle kicker="02" title="预测结果" note="默认使用 iManformer 作为主模型，同时保留 RNN、LSTM 与 Transformer 的对比结果。" />
          <div className="top-stats">
            <StatCard title="当前数据集" value={datasetSummary.source_name || "--"} detail="预测所使用的数据" />
            <StatCard title="预测模型数" value={DEFAULT_MODELS.length} detail="参与本次评估的模型" />
            <StatCard title="最佳模型" value={MODEL_META[bestModel]?.label || "--"} detail="按 RMSE 综合排序" tone="accent" />
            <StatCard title="最近一次预测时间" value={datasetSummary.created_at ? formatDate(datasetSummary.created_at) : "--"} detail="最近加载或上传时间" />
          </div>

          <div className="forecast-grid">
            <div className={chartPanelClass}>
              <div className="panel-head">
                <h3>功率预测趋势</h3>
                <div className="panel-head-tools">
                  <span>{chartView === "fullscreen" ? "全屏查看中，按 Esc 退出" : "拖拽曲线可框选缩放"}</span>
                  <div className="chart-actions">
                    <button
                      className="chart-reset-button"
                      onClick={resetChart}
                      type="button"
                      disabled={!chartData.length}
                      aria-label="重置图表视图"
                    >
                      重置视图
                    </button>
                    <div className="chart-view-switch" role="group" aria-label="图表视图模式">
                      {[
                        ["normal", "常规"],
                        ["wide", "宽屏"],
                        ["fullscreen", "全屏"],
                      ].map(([value, label]) => (
                        <button
                          key={value}
                          className={chartView === value ? "active" : ""}
                          onClick={() => setChartView(value)}
                          type="button"
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={chartHeight}>
                <LineChart
                  data={visibleChart}
                  onMouseDown={handleChartMouseDown}
                  onMouseMove={handleChartMouseMove}
                  onMouseUp={handleChartMouseUp}
                  onMouseLeave={() => {
                    dragRef.current = false;
                    setZoomDraft(null);
                  }}
                >
                  <CartesianGrid stroke="rgba(124,164,177,0.12)" strokeDasharray="4 8" />
                  <XAxis dataKey="time" tick={{ fill: "#9cb5c3", fontSize: 11 }} minTickGap={22} />
                  <YAxis tick={{ fill: "#9cb5c3", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#0d1b28", border: "1px solid rgba(124,164,177,0.28)", borderRadius: 14 }} />
                  <Legend />
                  <Line type="monotone" dataKey="actual" stroke="#e8f4f8" strokeWidth={2.6} dot={false} name="真实功率" />
                  {DEFAULT_MODELS.map((model) => (
                    <Line
                      key={model}
                      type="monotone"
                      dataKey={model}
                      stroke={MODEL_META[model].color}
                      strokeOpacity={model === "our_model" ? 1 : 0.72}
                      strokeWidth={model === "our_model" ? 3 : 1.7}
                      dot={false}
                      name={MODEL_META[model].label}
                    />
                  ))}
                  {zoomDraft ? (
                    <ReferenceArea
                      x1={visibleChart[Math.min(zoomDraft.start, zoomDraft.end)]?.time}
                      x2={visibleChart[Math.max(zoomDraft.start, zoomDraft.end)]?.time}
                      fill="rgba(32,200,245,0.14)"
                      strokeOpacity={0.2}
                    />
                  ) : null}
                </LineChart>
              </ResponsiveContainer>
              <div className="panel-foot">
                <span>可视区间：{visibleRange} · {visiblePointCount}/{totalPointCount || 0} 点</span>
              </div>
            </div>

            <div className="panel metrics-panel">
              <div className="panel-head">
                <h3>模型评估指标</h3>
              </div>
              <div className="metric-cards">
                <StatCard title="MAE" value={formatNumber(ourMetrics.MAE)} detail="平均绝对误差" />
                <StatCard title="RMSE" value={formatNumber(ourMetrics.RMSE)} detail="均方根误差" />
                <StatCard title="MAPE" value={`${formatNumber(ourMetrics.MAPE)}%`} detail="平均绝对百分比误差" />
                <StatCard title="R²" value={formatNumber(ourMetrics.R2, 3)} detail="拟合优度" />
              </div>
              <div className="compare-toggle">
                <span>模型对比</span>
                <button className={compareEnabled ? "toggle active" : "toggle"} onClick={() => setCompareEnabled((value) => !value)} type="button">
                  {compareEnabled ? "已开启" : "未开启"}
                </button>
              </div>
              {compareEnabled ? (
                <div className="table-shell compact">
                  <table>
                    <thead>
                      <tr>
                        <th>模型</th>
                        <th>MAE</th>
                        <th>RMSE</th>
                        <th>MAPE</th>
                        <th>R²</th>
                      </tr>
                    </thead>
                    <tbody>
                      {ranking.length ? ranking.map((item) => (
                        <tr key={item.model} className={item.model === bestModel ? "highlight-row" : ""}>
                          <td>{item.display_name}</td>
                          <td>{formatNumber(item.mae)}</td>
                          <td>{formatNumber(item.rmse)}</td>
                          <td>{formatNumber(predictResult.metrics?.[item.model]?.MAPE)}%</td>
                          <td>{formatNumber(item.r2, 3)}</td>
                        </tr>
                      )) : metricRows.map((item) => (
                        <tr key={item.model}>
                          <td>{item.model}</td>
                          <td>{formatNumber(item.MAE)}</td>
                          <td>{formatNumber(item.RMSE)}</td>
                          <td>{formatNumber(item.MAPE)}%</td>
                          <td>{formatNumber(item.R2, 3)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state compact-empty">默认展示 iManformer 指标。开启模型对比后可查看 RNN、LSTM、Transformer 横向结果。</div>
              )}
            </div>

            <div className="panel chart-panel">
              <div className="panel-head">
                <h3>误差分析</h3>
              </div>
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={visibleChart}>
                  <CartesianGrid stroke="rgba(124,164,177,0.12)" strokeDasharray="4 8" />
                  <XAxis dataKey="time" tick={{ fill: "#9cb5c3", fontSize: 11 }} minTickGap={22} />
                  <YAxis tick={{ fill: "#9cb5c3", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#0d1b28", border: "1px solid rgba(124,164,177,0.28)", borderRadius: 14 }} />
                  <Bar dataKey="our_model_error" fill="#20c8f5" radius={[8, 8, 0, 0]}>
                    {visibleChart.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.our_model_error >= 0 ? "#f97316" : "#20c8f5"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            <div className="panel summary-panel">
              <div className="panel-head">
                <h3>预测摘要</h3>
              </div>
              <div className="summary-list">
                <div><span>最优模型</span><strong>{MODEL_META[bestModel]?.label || "--"}</strong></div>
                <div><span>预测步长</span><strong>{predictResult?.params?.horizon || horizon} 步</strong></div>
                <div><span>总体表现</span><strong>{predictResult?.summary?.message || "曲线拟合良好"}</strong></div>
                <div><span>首段误差</span><strong>{formatNumber(firstError, 3)}</strong></div>
              </div>
            </div>
          </div>
        </section>
      )}

      {activePage === "analysis" && (
        <section className="dashboard-page">
          <SectionTitle kicker="03" title="DeepSeek分析" note="输入问题后，系统会调用 DeepSeek Chat Completions 接口返回回答，并保留预测指标与分析报告。" />
          <div className="analysis-layout">
            <div className="analysis-chat-column">
              <div className="panel analysis-panel analysis-question-panel">
                <div className="panel-head">
                  <h3>AI 问答</h3>
                  <div className="panel-head-tools">
                    <span>{analysisResult ? `${analysisResult.model} · ${analysisResult.mode === "online" ? "在线返回" : "离线返回"}` : "等待发送"}</span>
                  </div>
                </div>
                <div className="question-box">
                  <textarea
                    rows="4"
                    value={analysisQuestion}
                    onChange={(e) => setAnalysisQuestion(e.target.value)}
                    placeholder="请输入你想了解的问题，例如：某段误差为什么升高？"
                  />
                  <div className="question-actions">
                    <button onClick={() => handleAnalysis()} disabled={analysisLoading || !predictResult} type="button">
                      {analysisLoading ? "分析中..." : "发送"}
                    </button>
                    <span>{predictResult ? "基于当前预测结果回答" : "请先完成预测"}</span>
                  </div>
                </div>
                <div className="tag-row" aria-label="常用问题">
                  {SAMPLE_QUESTIONS.map((item) => (
                    <button
                      key={item}
                      className={selectedQuestion === item ? "tag active" : "tag"}
                      onClick={() => {
                        setSelectedQuestion(item);
                        setAnalysisQuestion(item);
                      }}
                      type="button"
                    >
                      {item}
                    </button>
                  ))}
                </div>
                <div className="analysis-response">
                  <div className="analysis-response-head">
                    <span>回答</span>
                    <strong>{analysisLoading ? "生成中" : analysisResult?.provider || "等待返回"}</strong>
                  </div>
                  {analysisLoading ? (
                    <div className="answer-loading" aria-label="正在生成回答">
                      <span />
                      <span />
                      <span />
                    </div>
                  ) : null}
                  {analysisResult ? (
                    <div className="analysis-response-body">
                      <div className="analysis-response-meta">
                        <div>
                          <span>来源</span>
                          <strong>{analysisResult.provider || "Deepseek"}</strong>
                        </div>
                        <div>
                          <span>模式</span>
                          <strong>{analysisResult.mode === "online" ? "在线" : "离线"}</strong>
                        </div>
                        <div>
                          <span>参考</span>
                          <strong>{analysisResult.qa?.references?.length || 0} 项</strong>
                        </div>
                      </div>
                      <div className="analysis-qa">
                        <div>
                          <span>问题</span>
                          <p>{analysisResult.qa?.question || "未输入具体问题"}</p>
                        </div>
                        <div>
                          <span>回答</span>
                          <p>{analysisResult.qa?.answer || "当前分析已返回，但暂无可展示的问答内容。"}</p>
                        </div>
                      </div>
                      {analysisResult.qa?.references?.length ? (
                        <div className="analysis-references">
                          {analysisResult.qa.references.map((item) => (
                            <span key={item}>{item}</span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : !analysisLoading ? (
                    <div className="empty-state compact-empty">
                      发送问题后，这里会直接显示 AI 回答、来源和引用依据。
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
            <div className="analysis-insight-column">
              <div className="analysis-stat-row">
                <StatCard title="最优模型" value={MODEL_META[bestModel]?.label || "--"} detail="按 RMSE 综合排序" tone="accent" />
                <StatCard title="RMSE" value={formatNumber(ourMetrics.RMSE)} detail="iManformer" />
                <StatCard title="MAE" value={formatNumber(ourMetrics.MAE)} detail="iManformer" />
              </div>
              <div className="panel analysis-panel diagnosis-panel">
                <div className="panel-head">
                  <h3>预测结果诊断</h3>
                </div>
                <ul className="diagnosis-list compact-diagnosis">
                  <li><strong>稳定性</strong><span>预测曲线整体跟随真实功率变化。</span></li>
                  <li><strong>误差风险</strong><span>重点查看高风速和爬坡区间的波动。</span></li>
                  <li><strong>影响因素</strong><span>风速、风向和温度变化仍是主要扰动来源。</span></li>
                </ul>
              </div>
              <div className="panel analysis-panel analysis-report-panel">
                <div className="panel-head">
                  <h3>分析报告</h3>
                </div>
                <ReportMarkdown content={analysisResult?.report} />
              </div>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
