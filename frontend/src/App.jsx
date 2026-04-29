import { useEffect, useRef, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { listSamples, loadSample, runPredict, uploadDataset } from "./api";

const MODEL_META = {
  rnn: { label: "RNN", color: "#f59e0b" },
  lstm: { label: "LSTM", color: "#22c55e" },
  transformer: { label: "Transformer", color: "#38bdf8" },
  our_model: { label: "Our Model", color: "#f43f5e" },
};

const DEFAULT_MODELS = Object.keys(MODEL_META);

function formatNumber(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return "--";
  return Number(value).toFixed(3);
}

function MetricCard({ title, value, sub }) {
  return (
    <section className="metric-card">
      <span>{title}</span>
      <strong>{value}</strong>
      <small>{sub}</small>
    </section>
  );
}

function App() {
  const [samples, setSamples] = useState([]);
  const [selectedSample, setSelectedSample] = useState("");
  const [dataset, setDataset] = useState(null);
  const [result, setResult] = useState(null);
  const [horizon, setHorizon] = useState(24);
  const [windowSize, setWindowSize] = useState(96);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const controllerRef = useRef(null);

  useEffect(() => {
    const controller = new AbortController();
    listSamples({ signal: controller.signal })
      .then((data) => {
        setSamples(data.samples || []);
        setSelectedSample(data.samples?.[0] || "");
      })
      .catch((error) => {
        if (error.name !== "AbortError") setMessage(error.message);
      });
    return () => controller.abort();
  }, []);

  const runSafely = async (job) => {
    controllerRef.current?.abort();
    controllerRef.current = new AbortController();
    setLoading(true);
    setMessage("");
    try {
      await job(controllerRef.current.signal);
    } catch (error) {
      if (error.name !== "AbortError") setMessage(error.message || "操作失败");
    } finally {
      setLoading(false);
    }
  };

  const handleLoadSample = () => {
    if (!selectedSample) return;
    runSafely(async (signal) => {
      const data = await loadSample(selectedSample, { signal });
      setDataset(data);
      setResult(null);
      setMessage(`已加载样例：${data.source_name}`);
    });
  };

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    runSafely(async (signal) => {
      const data = await uploadDataset(file, { signal });
      setDataset(data);
      setResult(null);
      setMessage(`已上传：${data.source_name}`);
    });
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
      setMessage(data.summary?.message || "预测完成");
    });
  };

  const bestModel = result?.summary?.best_model;
  const ranking = result?.ranking || [];
  const metrics = result?.metrics || {};
  const metricRows = DEFAULT_MODELS.map((model) => ({
    model: MODEL_META[model].label,
    MAE: metrics[model]?.MAE,
    RMSE: metrics[model]?.RMSE,
    MAPE: metrics[model]?.MAPE,
  }));

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Wind Power Forecast Lab</p>
          <h1>风电功率预测可视化系统</h1>
          <p className="hero-copy">
            读取当前 data 目录里的风电场 Excel 格式，自动识别时间列、功率列和气象特征，并完成 RNN、LSTM、Transformer 与 Our Model 的统一对比预测。
          </p>
        </div>
        <div className="hero-stat">
          <span>Demo API</span>
          <strong>{dataset ? "READY" : "WAITING"}</strong>
          <small>{dataset?.rows ? `${dataset.rows.toLocaleString()} 行数据` : "请选择样例或上传文件"}</small>
        </div>
      </section>

      <section className="control-grid">
        <div className="panel">
          <div className="panel-head">
            <span>01</span>
            <h2>数据接入</h2>
          </div>
          <div className="form-row">
            <label>样例数据</label>
            <select value={selectedSample} onChange={(event) => setSelectedSample(event.target.value)}>
              {samples.map((sample) => (
                <option value={sample} key={sample}>
                  {sample}
                </option>
              ))}
            </select>
            <button onClick={handleLoadSample} disabled={loading || !selectedSample}>
              加载样例
            </button>
          </div>
          <div className="upload-box">
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleUpload} disabled={loading} />
            <span>也可以上传 CSV / XLSX，首行需为列名</span>
          </div>
        </div>

        <div className="panel">
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
            {loading ? "处理中..." : "开始多模型预测"}
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
            <MetricCard title="最优模型" value={MODEL_META[bestModel]?.label || "--"} sub="按 RMSE / MAE 综合排序" />
            <MetricCard title="Our Model RMSE" value={formatNumber(metrics.our_model?.RMSE)} sub="越低越好" />
            <MetricCard title="Our Model MAE" value={formatNumber(metrics.our_model?.MAE)} sub="平均绝对误差" />
            <MetricCard title="Our Model R²" value={formatNumber(metrics.our_model?.R2)} sub="越接近 1 越好" />
          </section>

          <section className="visual-grid">
            <div className="panel chart-panel wide">
              <div className="panel-head">
                <span>曲线</span>
                <h2>真实值与预测值</h2>
              </div>
              <ResponsiveContainer width="100%" height={360}>
                <LineChart data={result.chart_data}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="4 8" />
                  <XAxis dataKey="time" tick={{ fill: "#8fa3b8", fontSize: 11 }} minTickGap={34} />
                  <YAxis tick={{ fill: "#8fa3b8", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#07111f", border: "1px solid #29445f", borderRadius: 12 }} />
                  <Legend />
                  <Line type="monotone" dataKey="actual" name="真实功率" stroke="#f8fafc" strokeWidth={3} dot={false} />
                  {DEFAULT_MODELS.map((model) => (
                    <Line
                      key={model}
                      type="monotone"
                      dataKey={model}
                      name={MODEL_META[model].label}
                      stroke={MODEL_META[model].color}
                      strokeWidth={model === "our_model" ? 3 : 2}
                      dot={false}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="panel chart-panel">
              <div className="panel-head">
                <span>指标</span>
                <h2>误差对比</h2>
              </div>
              <ResponsiveContainer width="100%" height={360}>
                <BarChart data={metricRows}>
                  <CartesianGrid stroke="rgba(148, 163, 184, 0.18)" strokeDasharray="4 8" />
                  <XAxis dataKey="model" tick={{ fill: "#8fa3b8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#8fa3b8", fontSize: 11 }} />
                  <Tooltip contentStyle={{ background: "#07111f", border: "1px solid #29445f", borderRadius: 12 }} />
                  <Legend />
                  <Bar dataKey="MAE" fill="#22c55e" radius={[8, 8, 0, 0]} />
                  <Bar dataKey="RMSE" fill="#38bdf8" radius={[8, 8, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="panel ranking-panel">
            <div className="panel-head">
              <span>排名</span>
              <h2>模型综合表现</h2>
            </div>
            <div className="ranking-list">
              {ranking.map((item, index) => (
                <article className={item.model === "our_model" ? "rank-card highlighted" : "rank-card"} key={item.model}>
                  <span>#{index + 1}</span>
                  <strong>{item.display_name}</strong>
                  <small>RMSE {formatNumber(item.rmse)} · MAE {formatNumber(item.mae)} · R² {formatNumber(item.r2)}</small>
                </article>
              ))}
            </div>
          </section>
        </>
      )}
    </main>
  );
}

export default App;
