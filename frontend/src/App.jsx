import { useEffect, useMemo, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { listSamples, loadSample, runAnalysis, runPredict, uploadDataset } from "./api";

const MODEL_META = {
  rnn: { label: "RNN", color: "#f59e0b", muted: "#5d4320" },
  lstm: { label: "LSTM", color: "#2dd4bf", muted: "#1d5756" },
  transformer: { label: "Transformer", color: "#38bdf8", muted: "#1d4b69" },
  our_model: { label: "iManformer", color: "#f43f5e", muted: "#6d2634" },
};

const DEFAULT_MODELS = Object.keys(MODEL_META);

function formatNumber(value, digits = 3) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toFixed(digits);
}

function scoreLower(value, minValue) {
  if (!Number.isFinite(Number(value)) || !Number.isFinite(Number(minValue)) || minValue <= 0) return 0;
  return Math.max(8, Math.min(100, (minValue / Number(value)) * 100));
}

function scoreR2(value) {
  if (!Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.min(100, ((Number(value) + 1) / 2) * 100));
}

function MetricCard({ title, value, sub, accent = false }) {
  return (
    <section className={accent ? "metric-card accent" : "metric-card"}>
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </section>
  );
}

function ReportMarkdown({ content }) {
  if (!content) return <p className="report-empty">生成报告后，Deepseek 会在这里给出数据和结果分析。</p>;
  return (
    <div className="report-body">
      {content.split("\n").map((line, index) => {
        if (line.startsWith("## ")) return <h3 key={index}>{line.replace("## ", "")}</h3>;
        if (line.startsWith("- ")) return <p key={index} className="report-bullet">{line.replace("- ", "")}</p>;
        return line.trim() ? <p key={index}>{line}</p> : <br key={index} />;
      })}
    </div>
  );
}

function App() {
  const [samples, setSamples] = useState([]);
  const [selectedSample, setSelectedSample] = useState("");
  const [sampleStatus, setSampleStatus] = useState("正在加载样例数据...");
  const [dataset, setDataset] = useState(null);
  const [result, setResult] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [activeView, setActiveView] = useState("forecast");
  const [horizon, setHorizon] = useState(24);
  const [windowSize, setWindowSize] = useState(96);
  const [loading, setLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState(null);
  const [loadingTask, setLoadingTask] = useState("");
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [curveWindow, setCurveWindow] = useState({ start: 0, end: null });
  const [zoomDraft, setZoomDraft] = useState(null);
  const controllerRef = useRef(null);
  const analysisControllerRef = useRef(null);
  const progressTimerRef = useRef(null);
  const progressResetTimerRef = useRef(null);
  const isDraggingCurveRef = useRef(false);
  const loadingRunRef = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    setSampleStatus("正在加载样例数据...");
    listSamples({ signal: controller.signal })
      .then((data) => {
        const nextSamples = data.samples || [];
        setSamples(nextSamples);
        setSelectedSample((current) => (nextSamples.includes(current) ? current : nextSamples[0] || ""));
        setSampleStatus(nextSamples.length ? "" : `未在 ${data.data_dir || "data"} 目录找到 CSV / XLSX / XLS 样例文件`);
      })
      .catch((error) => {
        if (error.name !== "AbortError") {
          setSamples([]);
          setSelectedSample("");
          setSampleStatus(`样例列表加载失败：${error.message}`);
        }
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    setCurveWindow({ start: 0, end: null });
    setZoomDraft(null);
  }, [result]);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) clearInterval(progressTimerRef.current);
      if (progressResetTimerRef.current) clearTimeout(progressResetTimerRef.current);
    };
  }, []);

  const startLoadingProgress = (task) => {
    if (progressTimerRef.current) clearInterval(progressTimerRef.current);
    if (progressResetTimerRef.current) clearTimeout(progressResetTimerRef.current);
    setLoadingTask(task);
    setLoadingProgress(8);
    progressTimerRef.current = setInterval(() => {
      setLoadingProgress((current) => {
        if (current === null) return current;
        if (current < 48) return Math.min(48, current + 10);
        if (current < 78) return Math.min(78, current + 5);
        return Math.min(94, current + 2);
      });
    }, 260);
  };

  const finishLoadingProgress = () => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setLoadingProgress(100);
    progressResetTimerRef.current = setTimeout(() => {
      setLoadingProgress(null);
      setLoadingTask("");
    }, 520);
  };

  const runSafely = async (job, task = "处理中") => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    const runId = loadingRunRef.current + 1;
    loadingRunRef.current = runId;
    setLoading(true);
    startLoadingProgress(task);
    setMessage("");
    try {
      await job(controllerRef.current.signal);
    } catch (error) {
      if (runId === loadingRunRef.current && error.name !== "AbortError") setMessage(error.message || "操作失败");
    } finally {
      if (runId === loadingRunRef.current) {
        setLoading(false);
        finishLoadingProgress();
      }
    }
  };

  const handleLoadSample = () => {
    if (!selectedSample) return;
    runSafely(async (signal) => {
      const data = await loadSample(selectedSample, { signal });
      setDataset(data);
      setResult(null);
      setAnalysis(null);
      setMessage(`已加载样例：${data.source_name}`);
    }, "加载样例数据");
  };

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    runSafely(async (signal) => {
      const data = await uploadDataset(file, { signal });
      setDataset(data);
      setResult(null);
      setAnalysis(null);
      setMessage(`已上传：${data.source_name}`);
    }, "上传并解析数据");
  };

  const handlePredict = () => {
    if (!dataset?.file_id) {
      setMessage("请先加载样例数据或上传数据文件");
      return;
    }
    runSafely(async (signal) => {
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
      setResult(data);
      setAnalysis(null);
      setMessage(data.summary?.message || "预测完成");
    }, "多模型预测");
  };

  const handleAnalysis = async () => {
    if (!dataset?.file_id || !result) {
      setMessage("请先完成预测，再进入 Deepseek 分析");
      return;
    }
    analysisControllerRef.current?.abort();
    analysisControllerRef.current = new AbortController();
    setAnalysisLoading(true);
    setMessage("");
    try {
      const data = await runAnalysis(
        {
          file_id: dataset.file_id,
          prediction_result: result,
          provider: "deepseek",
        },
        { signal: analysisControllerRef.current.signal },
      );
      setAnalysis(data);
      setActiveView("analysis");
    } catch (error) {
      if (error.name !== "AbortError") setMessage(error.message || "分析失败");
    } finally {
      setAnalysisLoading(false);
    }
  };

  const bestModel = result?.summary?.best_model;
  const ranking = result?.ranking || [];
  const metrics = result?.metrics || {};
  const metricRows = DEFAULT_MODELS.map((model) => ({
    model: MODEL_META[model].label,
    MAE: metrics[model]?.MAE,
    RMSE: metrics[model]?.RMSE,
    MAPE: metrics[model]?.MAPE,
    SMAPE: metrics[model]?.SMAPE,
  }));

  const radarRows = useMemo(() => {
    if (!result) return [];
    const metricNames = ["MAE", "RMSE", "MAPE", "SMAPE"];
    const mins = Object.fromEntries(
      metricNames.map((name) => [
        name,
        Math.min(...DEFAULT_MODELS.map((model) => Number(metrics[model]?.[name])).filter(Number.isFinite)),
      ]),
    );
    return [
      ...metricNames.map((name) => ({
        metric: name,
        ...Object.fromEntries(DEFAULT_MODELS.map((model) => [model, scoreLower(metrics[model]?.[name], mins[name])])),
      })),
      {
        metric: "R2",
        ...Object.fromEntries(DEFAULT_MODELS.map((model) => [model, scoreR2(metrics[model]?.R2)])),
      },
    ];
  }, [result, metrics]);

  const curveData = result?.chart_data || [];
  const visibleCurveData = useMemo(() => {
    const end = curveWindow.end ?? curveData.length;
    return curveData.slice(curveWindow.start, end);
  }, [curveData, curveWindow]);
  const isCurveZoomed = curveWindow.start > 0 || curveWindow.end !== null;
  const zoomStartLabel = zoomDraft ? visibleCurveData[Math.min(zoomDraft.start, zoomDraft.end)]?.time : null;
  const zoomEndLabel = zoomDraft ? visibleCurveData[Math.max(zoomDraft.start, zoomDraft.end)]?.time : null;

  const getActiveCurveIndex = (state) => {
    const rawIndex = state?.activeTooltipIndex ?? state?.activeIndex;
    const index = Number(rawIndex);
    if (Number.isInteger(index) && index >= 0 && index < visibleCurveData.length) return index;

    const labelIndex = visibleCurveData.findIndex((item) => item.time === state?.activeLabel);
    return labelIndex >= 0 ? labelIndex : null;
  };

  const getPointerButton = (event, state) => {
    return event?.button ?? event?.nativeEvent?.button ?? state?.event?.button ?? state?.event?.nativeEvent?.button;
  };

  const handleCurveMouseDown = (state, event) => {
    const button = getPointerButton(event, state);
    if (button != null && button !== 0) return;
    const index = getActiveCurveIndex(state);
    if (index !== null) {
      isDraggingCurveRef.current = true;
      setZoomDraft({ start: index, end: index });
    }
  };

  const handleCurveMouseMove = (state) => {
    if (!isDraggingCurveRef.current) return;
    const index = getActiveCurveIndex(state);
    if (zoomDraft && index !== null) setZoomDraft((draft) => ({ ...draft, end: index }));
  };

  const handleCurveMouseUp = () => {
    isDraggingCurveRef.current = false;
    if (!zoomDraft) return;
    const start = Math.min(zoomDraft.start, zoomDraft.end);
    const end = Math.max(zoomDraft.start, zoomDraft.end);
    if (end - start >= 2) {
      setCurveWindow({
        start: curveWindow.start + start,
        end: curveWindow.start + end + 1,
      });
    }
    setZoomDraft(null);
  };

  const handleCurveDoubleClick = (state, event) => {
    const button = getPointerButton(event, state);
    if (button != null && button !== 0) return;
    const index = getActiveCurveIndex(state);
    if (index === null || curveData.length <= 3) return;

    const absoluteIndex = curveWindow.start + index;
    const radius = Math.max(4, Math.min(36, Math.floor(visibleCurveData.length * 0.12)));
    const start = Math.max(0, absoluteIndex - radius);
    const end = Math.min(curveData.length, absoluteIndex + radius + 1);

    if (end - start >= 3 && (start !== curveWindow.start || end !== (curveWindow.end ?? curveData.length))) {
      setCurveWindow({ start, end });
      setZoomDraft(null);
    }
  };

  const resetCurveZoom = () => {
    setCurveWindow({ start: 0, end: null });
    setZoomDraft(null);
    isDraggingCurveRef.current = false;
  };

  const improvement = result
    ? ranking.find((item) => item.model !== "our_model")?.rmse - metrics.our_model?.RMSE
    : null;

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div className="hero-copy-block">
          <p className="eyebrow">Wind Power Forecast Lab</p>
          <h1>风电功率预测与智能分析系统</h1>
          <p className="hero-copy">
            读取风电场时序数据，完成 RNN、LSTM、Transformer 与 iManformer 的统一对比预测，并用 Deepseek 生成面向工程汇报的结果分析。
          </p>
          <div className="view-switch" aria-label="界面切换">
            <button className={activeView === "forecast" ? "switch-active" : ""} onClick={() => setActiveView("forecast")}>
              预测驾驶舱
            </button>
            <button className={activeView === "analysis" ? "switch-active" : ""} onClick={() => setActiveView("analysis")}>
              Deepseek 分析
            </button>
          </div>
        </div>
        <div className="hero-stat">
          <span>System State</span>
          <strong>{dataset ? "READY" : "WAITING"}</strong>
          <small>{dataset?.rows ? `${dataset.rows.toLocaleString()} 行数据` : "请选择样例或上传文件"}</small>
        </div>
      </section>

      {activeView === "forecast" && (
        <>
          <section className="control-grid">
            <div className="panel data-panel">
              <div className="panel-head">
                <span>01</span>
                <h2>数据接入</h2>
              </div>
              <div className="form-row">
                <label>样例数据</label>
                <select
                  value={selectedSample}
                  onChange={(event) => setSelectedSample(event.target.value)}
                  disabled={loading || samples.length === 0}
                >
                  {samples.length === 0 ? (
                    <option value="">暂无可用样例</option>
                  ) : (
                    samples.map((sample) => (
                      <option value={sample} key={sample}>
                        {sample}
                      </option>
                    ))
                  )}
                </select>
                <button onClick={handleLoadSample} disabled={loading || !selectedSample}>
                  加载样例
                </button>
              </div>
              {sampleStatus && <p className="sample-status">{sampleStatus}</p>}
              <div className="upload-box">
                <input type="file" accept=".csv,.xlsx,.xls" onChange={handleUpload} disabled={loading} />
                <span>也可以上传 CSV / XLSX，首行需为列名</span>
              </div>
              {loadingProgress !== null && ["加载样例数据", "上传并解析数据"].includes(loadingTask) && (
                <div className="progress-block" role="status" aria-live="polite">
                  <div className="progress-row">
                    <span>{loadingTask}</span>
                    <strong>{Math.round(loadingProgress)}%</strong>
                  </div>
                  <div
                    className="progress-track"
                    role="progressbar"
                    aria-label={loadingTask}
                    aria-valuemin="0"
                    aria-valuemax="100"
                    aria-valuenow={Math.round(loadingProgress)}
                  >
                    <span style={{ width: `${loadingProgress}%` }} />
                  </div>
                </div>
              )}
            </div>

            <div className="panel parameter-panel">
              <div className="panel-head">
                <span>02</span>
                <h2>预测参数</h2>
              </div>
              <div className="param-grid">
                <label>
                  预测步长
                  <input type="number" min="1" max="336" value={horizon} onChange={(event) => setHorizon(event.target.value)} />
                </label>
                <label>
                  窗口长度
                  <input type="number" min="8" max="2000" value={windowSize} onChange={(event) => setWindowSize(event.target.value)} />
                </label>
              </div>
              <button className="primary-action" onClick={handlePredict} disabled={loading || !dataset}>
                {loading && loadingTask === "多模型预测" ? "处理中..." : "开始多模型预测"}
              </button>
              <button className="secondary-action" onClick={handleAnalysis} disabled={analysisLoading || !result}>
                {analysisLoading ? "分析生成中..." : "生成 Deepseek 分析报告"}
              </button>
              {message && <p className="message">{message}</p>}
            </div>

            <div className="panel schema-panel">
              <div className="panel-head">
                <span>03</span>
                <h2>列名识别</h2>
              </div>
              <dl>
                <div>
                  <dt>时间列</dt>
                  <dd>{dataset?.inferred?.time_column || "--"}</dd>
                </div>
                <div>
                  <dt>目标列</dt>
                  <dd>{dataset?.inferred?.target_column || "--"}</dd>
                </div>
                <div>
                  <dt>特征数</dt>
                  <dd>{dataset?.inferred?.feature_columns?.length ?? "--"}</dd>
                </div>
              </dl>
            </div>
          </section>

          {result && (
            <>
              <section className="metric-grid">
                <MetricCard title="最优模型" value={MODEL_META[bestModel]?.label || "--"} sub="按 RMSE / MAE 综合排序" accent />
                <MetricCard title="iManformer RMSE" value={formatNumber(metrics.our_model?.RMSE)} sub="越低越好" />
                <MetricCard title="iManformer MAE" value={formatNumber(metrics.our_model?.MAE)} sub="平均绝对误差" />
                <MetricCard title="领先幅度" value={formatNumber(improvement, 3)} sub="相对第二名 RMSE 差值" />
              </section>

              <section className="visual-grid">
                <div className="panel chart-panel wide">
                  <div className="panel-head">
                    <div>
                      <span>Curve</span>
                      <h2>真实值与预测值</h2>
                    </div>
                    <div className="curve-tools">
                      <small>{isCurveZoomed ? "已放大局部区间" : "按住鼠标框选可放大"}</small>
                      <button onClick={resetCurveZoom} disabled={!isCurveZoomed}>
                        重置视图
                      </button>
                    </div>
                  </div>
                  <ResponsiveContainer width="100%" height={380}>
                    <LineChart
                      data={visibleCurveData}
                      onMouseDown={handleCurveMouseDown}
                      onMouseMove={handleCurveMouseMove}
                      onMouseUp={handleCurveMouseUp}
                      onMouseLeave={() => {
                        isDraggingCurveRef.current = false;
                        setZoomDraft(null);
                      }}
                      onDoubleClick={handleCurveDoubleClick}
                    >
                      <CartesianGrid stroke="rgba(148, 163, 184, 0.16)" strokeDasharray="4 8" />
                      <XAxis dataKey="time" tick={{ fill: "#8fa3b8", fontSize: 11 }} minTickGap={34} />
                      <YAxis tick={{ fill: "#8fa3b8", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "#101922", border: "1px solid #263746", borderRadius: 16 }} />
                      <Legend />
                      <Line type="monotone" dataKey="actual" name="真实功率" stroke="#f8fafc" strokeWidth={3.4} dot={false} />
                      {DEFAULT_MODELS.map((model) => (
                        <Line
                          key={model}
                          type="monotone"
                          dataKey={model}
                          name={MODEL_META[model].label}
                          stroke={MODEL_META[model].color}
                          strokeWidth={model === "our_model" ? 3.2 : 2}
                          strokeOpacity={model === "our_model" ? 1 : 0.72}
                          dot={false}
                        />
                      ))}
                      {zoomStartLabel && zoomEndLabel && zoomStartLabel !== zoomEndLabel && (
                        <ReferenceArea x1={zoomStartLabel} x2={zoomEndLabel} strokeOpacity={0.24} fill="#2dd4bf" fillOpacity={0.16} />
                      )}
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="panel ranking-panel side-ranking-panel">
                  <div className="panel-head">
                    <span>Ranking</span>
                    <h2>模型综合表现</h2>
                  </div>
                  <div className="ranking-list">
                    {ranking.map((item, index) => (
                      <article className={item.model === "our_model" ? "rank-card highlighted" : "rank-card"} key={item.model}>
                        <span>#{index + 1}</span>
                        <strong>{item.display_name}</strong>
                        <small>RMSE {formatNumber(item.rmse)} · MAE {formatNumber(item.mae)} · R2 {formatNumber(item.r2)}</small>
                      </article>
                    ))}
                  </div>
                </div>
              </section>

              <section className="metric-visual-row">
                <div className="panel chart-panel">
                  <div className="panel-head">
                    <span>Metrics</span>
                    <h2>误差指标对比</h2>
                  </div>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={metricRows}>
                      <CartesianGrid stroke="rgba(148, 163, 184, 0.16)" strokeDasharray="4 8" />
                      <XAxis dataKey="model" tick={{ fill: "#8fa3b8", fontSize: 11 }} />
                      <YAxis tick={{ fill: "#8fa3b8", fontSize: 11 }} />
                      <Tooltip contentStyle={{ background: "#101922", border: "1px solid #263746", borderRadius: 16 }} />
                      <Legend />
                      <Bar dataKey="MAE" fill="#2dd4bf" radius={[9, 9, 0, 0]} />
                      <Bar dataKey="RMSE" fill="#f43f5e" radius={[9, 9, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="panel chart-panel radar-panel">
                  <div className="panel-head">
                    <span>Radar</span>
                    <h2>多指标雷达图</h2>
                  </div>
                  <ResponsiveContainer width="100%" height={320}>
                    <RadarChart data={radarRows} outerRadius="72%">
                      <PolarGrid stroke="rgba(148, 163, 184, 0.24)" />
                      <PolarAngleAxis dataKey="metric" tick={{ fill: "#cad7e6", fontSize: 12 }} />
                      <Tooltip contentStyle={{ background: "#101922", border: "1px solid #263746", borderRadius: 16 }} />
                      {DEFAULT_MODELS.map((model) => (
                        <Radar
                          key={model}
                          name={MODEL_META[model].label}
                          dataKey={model}
                          stroke={MODEL_META[model].color}
                          fill={MODEL_META[model].color}
                          fillOpacity={model === "our_model" ? 0.18 : 0.06}
                          strokeWidth={model === "our_model" ? 3 : 1.8}
                        />
                      ))}
                      <Legend />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </>
          )}
        </>
      )}

      {activeView === "analysis" && (
        <section className="analysis-layout">
          <div className="panel analysis-command">
            <div className="panel-head">
              <span>AI Analysis</span>
              <h2>Deepseek 分析工作台</h2>
            </div>
            <p>
              该界面会把数据概况、预测指标和模型排名发送到后端分析接口。后端优先调用 Deepseek，未配置密钥时会返回本地规则报告，保证演示流程不断线。
            </p>
            <button className="primary-action" onClick={handleAnalysis} disabled={analysisLoading || !result}>
              {analysisLoading ? "正在调用 Deepseek..." : "生成分析报告"}
            </button>
            {!result && <p className="message">需要先在预测驾驶舱完成一次预测。</p>}
            {analysis && (
              <div className="analysis-meta">
                <span>Provider</span>
                <strong>{analysis.provider}</strong>
                <small>{analysis.model} · {analysis.mode === "online" ? "在线调用" : "离线兜底"}</small>
              </div>
            )}
          </div>

          <div className="panel report-panel">
            <div className="panel-head">
              <span>Report</span>
              <h2>分析报告</h2>
            </div>
            <ReportMarkdown content={analysis?.report} />
          </div>

          <div className="panel insight-strip">
            <span>iManformer</span>
            <strong>{formatNumber(metrics.our_model?.RMSE)}</strong>
            <small>当前 RMSE</small>
          </div>
          <div className="panel insight-strip warm">
            <span>Data Rows</span>
            <strong>{dataset?.rows?.toLocaleString() || "--"}</strong>
            <small>分析样本规模</small>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
