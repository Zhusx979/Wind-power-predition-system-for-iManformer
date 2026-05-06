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
  rnn: { label: "RNN", color: "#9fe7ff" },
  lstm: { label: "LSTM", color: "#ffd166" },
  transformer: { label: "Transformer", color: "#c9d6ff" },
  our_model: { label: "iManformer", color: "#57f0d5" },
};

const NAV_ITEMS = [
  { key: "load", label: "数据加载" },
  { key: "forecast", label: "预测结果" },
  { key: "analysis", label: "DeepSeek分析" },
];

const DEFAULT_MODELS = Object.keys(MODEL_META);
const DEFAULT_ANALYSIS_MODEL = "deepseek-chat";
const SAMPLE_QUESTIONS = [
  "为什么 08:00-10:00 误差会上升？",
  "未来 24 小时哪些气象因素影响最大？",
  "iManformer 相比其他模型优势在哪里？",
  "如何降低高风速区间的预测误差？",
  "你是什么模型？",
  "结合当前预测结果，功率和误差的整体变化趋势是什么？",
];
const EMPTY_ANALYSIS_ANSWER = "当前分析已返回，暂无可展示的问答内容";

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
    model: result.model || DEFAULT_ANALYSIS_MODEL,
    qa: {
      question: qa.question || question || "",
      answer: qa.answer || EMPTY_ANALYSIS_ANSWER,
      references: Array.isArray(qa.references) ? qa.references : [],
    },
  };
}

function createAnalysisTurn(question, id) {
  return {
    id,
    question,
    answer: "",
    references: [],
    provider: "DeepSeek Chat Completions",
    mode: "pending",
    model: DEFAULT_ANALYSIS_MODEL,
    report: "",
    status: "loading",
  };
}

function toNumber(value) {
  const number = Number.parseFloat(String(value ?? "").replace(/[^\d.-]/g, ""));
  return Number.isFinite(number) ? number : null;
}

function findColumn(columns, keywords) {
  return columns.find((column) => {
    const normalized = String(column).toLowerCase();
    return keywords.some((keyword) => normalized.includes(keyword));
  });
}

function formatMetric(value, unit, digits = 1) {
  if (!Number.isFinite(value)) return "--";
  return `${Number(value).toFixed(digits)} ${unit}`;
}

function windDirectionLabel(value) {
  const degree = toNumber(value);
  if (!Number.isFinite(degree)) return value ? String(value) : "--";
  const labels = ["北风", "东北风", "东风", "东南风", "南风", "西南风", "西风", "西北风"];
  return labels[Math.round((((degree % 360) + 360) % 360) / 45) % labels.length];
}

function weatherPhenomenon({ windSpeed, temperature, humidity }) {
  if (Number.isFinite(windSpeed) && windSpeed >= 17.2) return "大风";
  if (Number.isFinite(temperature) && temperature >= 35) return "高温";
  if (Number.isFinite(temperature) && temperature <= 0) return "霜冻";
  if (Number.isFinite(humidity) && humidity >= 85) return "阴雨";
  if (Number.isFinite(humidity) && humidity >= 65) return "多云";
  return "晴";
}

function warningRank(level) {
  return ["", "蓝色", "黄色", "橙色", "红色"].indexOf(level);
}

function buildWarning(weather) {
  const warnings = [];
  const wind = weather.windSpeed;
  const temp = weather.temperature;
  const drop = weather.temperatureDrop;

  if (Number.isFinite(wind)) {
    if (wind >= 32.7) warnings.push({ type: "大风", level: "红色", detail: "阵风或平均风速达到十二级以上，需重点关注设备安全" });
    else if (wind >= 24.5) warnings.push({ type: "大风", level: "橙色", detail: "风力达到十级以上，需限制高风险作业" });
    else if (wind >= 17.2) warnings.push({ type: "大风", level: "黄色", detail: "风力达到八级以上，需加强巡检与偏航保护" });
    else if (wind >= 10.8) warnings.push({ type: "大风", level: "蓝色", detail: "风力达到六级以上，建议关注机组载荷变化" });
  }

  if (Number.isFinite(temp)) {
    if (temp >= 40) warnings.push({ type: "高温", level: "红色", detail: "最高气温达到40°C以上，需关注散热与限功率风险" });
    else if (temp >= 37) warnings.push({ type: "高温", level: "橙色", detail: "最高气温达到37°C以上，需加强设备温升监测" });
    else if (temp >= 35) warnings.push({ type: "高温", level: "黄色", detail: "最高气温达到35°C以上，建议关注运行温度裕度" });

    if (temp <= -5) warnings.push({ type: "霜冻", level: "橙色", detail: "低温霜冻风险较高，需关注叶片结冰和传感器可靠性" });
    else if (temp <= -3) warnings.push({ type: "霜冻", level: "黄色", detail: "存在霜冻风险，建议关注低温部件状态" });
    else if (temp <= 0) warnings.push({ type: "霜冻", level: "蓝色", detail: "接近冰点，需关注局地霜冻可能" });
  }

  if (Number.isFinite(drop) && Number.isFinite(temp) && temp <= 4) {
    if (drop >= 16) warnings.push({ type: "寒潮", level: "红色", detail: "降温幅度极大，需关注低温冲击和覆冰风险" });
    else if (drop >= 12) warnings.push({ type: "寒潮", level: "橙色", detail: "降温明显，需提前检查防寒与防冰策略" });
    else if (drop >= 10) warnings.push({ type: "寒潮", level: "黄色", detail: "冷空气影响增强，需关注低温运行风险" });
    else if (drop >= 8) warnings.push({ type: "寒潮", level: "蓝色", detail: "气温下降明显，建议跟踪后续温度变化" });
  }

  return warnings.sort((a, b) => warningRank(b.level) - warningRank(a.level))[0] || {
    type: "常规天气",
    level: "平稳",
    detail: "当前气象条件未触发重点灾害预警",
  };
}

function buildWeatherProfile(dataset) {
  const rows = dataset?.preview || [];
  const current = rows[0] || {};
  const columns = Object.keys(current);
  const windSpeedColumn = findColumn(columns, ["wind speed", "风速"]);
  const windDirectionColumn = findColumn(columns, ["wind direction", "风向"]);
  const temperatureColumn = findColumn(columns, ["temperature", "温度"]);
  const humidityColumn = findColumn(columns, ["humidity", "湿度"]);
  const pressureColumn = findColumn(columns, ["atmosphere", "pressure", "气压"]);

  const temperatures = rows.map((row) => toNumber(row[temperatureColumn])).filter(Number.isFinite);
  const temperature = toNumber(current[temperatureColumn]);
  const windSpeed = toNumber(current[windSpeedColumn]);
  const humidity = toNumber(current[humidityColumn]);
  const pressure = toNumber(current[pressureColumn]);
  const weather = {
    windSpeed,
    windDirection: windDirectionLabel(current[windDirectionColumn]),
    temperature,
    humidity,
    pressure,
    phenomenon: weatherPhenomenon({ windSpeed, temperature, humidity }),
    temperatureDrop: temperatures.length ? Math.max(...temperatures) - Math.min(...temperatures) : null,
  };
  const warning = buildWarning(weather);

  return {
    current: weather,
    warning,
    columns: {
      windSpeed: windSpeedColumn,
      windDirection: windDirectionColumn,
      temperature: temperatureColumn,
      humidity: humidityColumn,
      pressure: pressureColumn,
    },
    forecast: rows.slice(0, 6).map((row, index) => {
      const nextWind = toNumber(row[windSpeedColumn]);
      const nextTemp = toNumber(row[temperatureColumn]);
      const nextHumidity = toNumber(row[humidityColumn]);
      return {
        label: `+${index + 1}h`,
        phenomenon: weatherPhenomenon({ windSpeed: nextWind, temperature: nextTemp, humidity: nextHumidity }),
        wind: formatMetric(nextWind, "m/s"),
        temperature: formatMetric(nextTemp, "°C"),
      };
    }),
  };
}

function WeatherOverview({ profile, sourceName, timeRange }) {
  const warningClass = `weather-warning level-${profile.warning.level}`;
  const station = sourceName || "样例风电场基地";
  const metricCards = [
    ["当前风速", formatMetric(profile.current.windSpeed, "m/s"), "wind"],
    ["风向", profile.current.windDirection || "--", "direction"],
    ["温度", formatMetric(profile.current.temperature, "°C"), "temperature"],
    ["湿度", formatMetric(profile.current.humidity, "%"), "humidity"],
    ["气压", formatMetric(profile.current.pressure, "hPa"), "pressure"],
    ["天气现象", profile.current.phenomenon, "weather"],
  ];

  return (
    <div className="panel weather-panel">
      <div className="panel-head">
        <h3>气象站信息（当前实况）</h3>
        <span className="panel-head-tools">
          <span>依据国家气象灾害预警信号分级规则</span>
        </span>
      </div>
      <div className={warningClass}>
        <strong>{profile.warning.level === "平稳" ? "气象态势：平稳" : `气象预警：${profile.warning.type} ${profile.warning.level}预警`}</strong>
        <span>{profile.warning.detail}</span>
        <em>预警时段：{timeRange}</em>
      </div>
      <div className="weather-station-row">
        <span>场站名称</span>
        <strong>{station}</strong>
      </div>
      <div className="weather-metrics">
        {metricCards.map(([label, value, icon]) => (
          <div className="weather-metric" key={label}>
            <i className={`weather-icon ${icon}`} />
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <div className="weather-forecast">
        <h4>逐小时气象片段（预览前6条）</h4>
        <div>
          {profile.forecast.length ? profile.forecast.map((item) => (
            <article key={item.label}>
              <strong>{item.label}</strong>
              <span>{item.phenomenon}</span>
              <small>风速 {item.wind}</small>
              <small>温度 {item.temperature}</small>
            </article>
          )) : <p className="empty-state compact-empty">加载数据后生成气象片段</p>}
        </div>
      </div>
    </div>
  );
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
    return <div className="empty-state">加载样例或上传文件后显示数据预览</div>;
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
  if (!content) return <div className="empty-state">完成预测后生成结构化诊断结论</div>;
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

function ParticleWindBackground() {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return undefined;

    let frameId = 0;
    let width = 0;
    let height = 0;
    let time = 0;
    const skyParticles = Array.from({ length: 180 }, (_, index) => ({
      seed: index * 13.17,
      x: Math.random(),
      y: Math.random(),
      speed: 0.0008 + Math.random() * 0.0014,
      size: 0.7 + Math.random() * 1.4,
      alpha: 0.16 + Math.random() * 0.38,
    }));

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = canvas.offsetWidth;
      height = canvas.offsetHeight;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    };

    const line = (x1, y1, x2, y2, alpha, widthValue) => {
      context.strokeStyle = `rgba(176, 223, 246, ${alpha})`;
      context.lineWidth = widthValue;
      context.beginPath();
      context.moveTo(x1, y1);
      context.lineTo(x2, y2);
      context.stroke();
    };

    const glowDot = (x, y, radius, alpha) => {
      context.fillStyle = `rgba(218, 244, 255, ${alpha})`;
      context.beginPath();
      context.arc(x, y, radius, 0, Math.PI * 2);
      context.fill();
    };

    const drawParticleSegment = (x1, y1, x2, y2, scale, density) => {
      for (let step = 0; step <= density; step += 1) {
        const progress = step / density;
        const offset = Math.sin(progress * 12 + time * 0.025) * 1.2 * scale;
        const x = x1 + (x2 - x1) * progress + offset;
        const y = y1 + (y2 - y1) * progress + offset * 0.18;
        glowDot(x, y, Math.max(0.7, 1.6 * scale * (0.55 + progress * 0.8)), 0.2 + progress * 0.55);
      }
    };

    const drawTurbine = (x, baseY, scale, phase, brightness = 1) => {
      const mastTop = baseY - 230 * scale;
      const hubRadius = 8 * scale;
      context.save();
      context.shadowColor = `rgba(96, 210, 255, ${0.72 * brightness})`;
      context.shadowBlur = 22 * scale;

      line(x, baseY, x, mastTop, 0.68 * brightness, Math.max(1, 1.8 * scale));
      drawParticleSegment(x, baseY, x, mastTop, scale, Math.max(24, Math.floor(42 * scale)));
      glowDot(x, mastTop, hubRadius, 0.98 * brightness);

      for (let blade = 0; blade < 3; blade += 1) {
        const angle = phase + blade * ((Math.PI * 2) / 3);
        const bladeLength = 148 * scale;
        const tipX = x + Math.cos(angle) * bladeLength;
        const tipY = mastTop + Math.sin(angle) * bladeLength;
        line(x, mastTop, tipX, tipY, 0.74 * brightness, Math.max(1, 1.45 * scale));
        drawParticleSegment(x, mastTop, tipX, tipY, scale, Math.max(22, Math.floor(46 * scale)));
        glowDot(tipX, tipY, 2.6 * scale, 0.82 * brightness);
      }

      context.restore();
    };

    const drawMesh = () => {
      const meshRows = 17;
      const meshCols = 34;
      const horizonY = height * 0.67;
      const waveAt = (rowProgress, colProgress, rowIndex) => {
        const amplitude = 14 + rowProgress * 52;
        return (
          Math.sin(colProgress * 8.4 + rowIndex * 0.42 + time * 0.012) * amplitude +
          Math.cos(colProgress * 12.6 - rowIndex * 0.37 - time * 0.01) * amplitude * 0.36
        );
      };

      for (let row = 0; row < meshRows; row += 1) {
        const rowProgress = row / (meshRows - 1);
        const y = horizonY + rowProgress * rowProgress * height * 0.27;
        let previousPoint = null;

        for (let col = 0; col < meshCols; col += 1) {
          const colProgress = col / (meshCols - 1);
          const x = colProgress * width;
          const pointY = y + waveAt(rowProgress, colProgress, row);

          if (previousPoint) {
            line(previousPoint[0], previousPoint[1], x, pointY, 0.08 + rowProgress * 0.18, 1);
          }

          if (row > 0) {
            const prevRowProgress = (row - 1) / (meshRows - 1);
            const prevRowY = horizonY + prevRowProgress * prevRowProgress * height * 0.27;
            const parentY = prevRowY + waveAt(prevRowProgress, colProgress, row - 1);
            line(x, parentY, x, pointY, 0.05 + rowProgress * 0.16, 1);
          }

          if (col % 2 === 0 || row % 2 === 0) {
            glowDot(x, pointY, 0.7 + rowProgress * 1.3, 0.12 + rowProgress * 0.36);
          }

          previousPoint = [x, pointY];
        }
      }
    };

    const draw = () => {
      time += 1;
      context.clearRect(0, 0, width, height);

      const sky = context.createLinearGradient(0, 0, 0, height);
      sky.addColorStop(0, "#071624");
      sky.addColorStop(0.45, "#0c2437");
      sky.addColorStop(1, "#07111b");
      context.fillStyle = sky;
      context.fillRect(0, 0, width, height);

      const leftGlow = context.createRadialGradient(width * 0.16, height * 0.48, 0, width * 0.16, height * 0.48, width * 0.36);
      leftGlow.addColorStop(0, "rgba(97, 191, 255, 0.28)");
      leftGlow.addColorStop(1, "rgba(97, 191, 255, 0)");
      context.fillStyle = leftGlow;
      context.fillRect(0, 0, width, height);

      drawMesh();
      drawTurbine(width * 0.1, height * 0.82, 1.22, time * 0.012, 1);
      drawTurbine(width * 0.91, height * 0.72, 0.58, -time * 0.011, 0.88);
      drawTurbine(width * 0.03, height * 0.82, 0.38, time * 0.01, 0.55);
      drawTurbine(width * 0.16, height * 0.84, 0.28, -time * 0.009, 0.42);
      drawTurbine(width * 0.24, height * 0.83, 0.26, time * 0.01, 0.36);
      drawTurbine(width * 0.85, height * 0.8, 0.22, -time * 0.008, 0.32);
      drawTurbine(width * 0.96, height * 0.83, 0.18, time * 0.007, 0.26);

      skyParticles.forEach((particle) => {
        particle.x += particle.speed;
        if (particle.x > 1.04) particle.x = -0.04;
        const wave = Math.sin(time * 0.012 + particle.seed) * 0.02;
        glowDot(particle.x * width, (0.08 + particle.y * 0.78 + wave) * height, particle.size, particle.alpha);
      });

      const vignette = context.createLinearGradient(0, 0, 0, height);
      vignette.addColorStop(0, "rgba(4, 10, 18, 0.08)");
      vignette.addColorStop(1, "rgba(4, 10, 18, 0.46)");
      context.fillStyle = vignette;
      context.fillRect(0, 0, width, height);

      frameId = window.requestAnimationFrame(draw);
    };

    resize();
    draw();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  return <canvas className="particle-wind-canvas" ref={canvasRef} aria-hidden="true" />;
}

function App() {
  const [activePage, setActivePage] = useState("start");
  const [samples, setSamples] = useState([]);
  const [selectedSample, setSelectedSample] = useState("");
  const [dataset, setDataset] = useState(null);
  const [predictResult, setPredictResult] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [analysisHistory, setAnalysisHistory] = useState([]);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [analysisLoading, setAnalysisLoading] = useState(false);
  const [horizon, setHorizon] = useState(24);
  const [windowSize, setWindowSize] = useState(96);
  const [compareEnabled, setCompareEnabled] = useState(false);
  const [analysisQuestion, setAnalysisQuestion] = useState("");
  const [selectedQuestion, setSelectedQuestion] = useState(SAMPLE_QUESTIONS[0]);
  const [dataStatus, setDataStatus] = useState("正在加载样例数据");
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
    withLoading("正在加载样例数据", async (signal) => {
      const data = await loadSample(selectedSample, { signal });
      setDataset(data);
      setPredictResult(null);
      setAnalysisResult(null);
      setAnalysisHistory([]);
      setAnalysisQuestion("");
      setSelectedQuestion(SAMPLE_QUESTIONS[0]);
      setActivePage("load");
      setMessage(`已加载样例：${data.source_name}`);
    });
  };

  const handleUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    withLoading("正在上传并解析数据", async (signal) => {
      const data = await uploadDataset(file, { signal });
      setDataset(data);
      setPredictResult(null);
      setAnalysisResult(null);
      setAnalysisHistory([]);
      setAnalysisQuestion("");
      setSelectedQuestion(SAMPLE_QUESTIONS[0]);
      setActivePage("load");
      setMessage(`已上传：${data.source_name}`);
    });
  };

  const handlePredict = () => {
    if (!dataset?.file_id) {
      setMessage("请先加载样例数据或上传文件");
      return;
    }
    withLoading("正在执行多模型预测", async (signal) => {
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
      setAnalysisHistory([]);
      setAnalysisQuestion("");
      setSelectedQuestion(SAMPLE_QUESTIONS[0]);
      setActivePage("forecast");
      setMessage(data.summary?.message || "预测完成");
    });
  };

  const handleAnalysis = (question = analysisQuestion) => {
    if (!dataset?.file_id || !predictResult) {
      setMessage("请先完成预测，再进入分析");
      return;
    }
    const nextQuestion = String(question || "").trim();
    if (!nextQuestion) {
      setMessage("请输入问题后再发送");
      return;
    }

    analysisControllerRef.current?.abort();
    const controller = new AbortController();
    analysisControllerRef.current = controller;
    const turnId = `analysis-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setAnalysisLoading(true);
    setMessage("");
    setAnalysisQuestion("");
    setSelectedQuestion("");
    setAnalysisHistory((current) => [...current, createAnalysisTurn(nextQuestion, turnId)]);
    runAnalysis(
      {
        file_id: dataset.file_id,
        prediction_result: predictResult,
        provider: "deepseek",
        question: nextQuestion,
      },
      { signal: controller.signal },
    )
      .then((data) => {
        const nextResult = normalizeAnalysisResult(data, nextQuestion);
        setAnalysisResult(nextResult);
        setAnalysisHistory((current) =>
          current.map((item) => (item.id === turnId
            ? {
              ...item,
              question: nextResult.qa?.question || nextQuestion,
              answer: nextResult.qa?.answer || EMPTY_ANALYSIS_ANSWER,
              references: nextResult.qa?.references || [],
              provider: nextResult.provider || item.provider,
              mode: nextResult.mode || "offline",
              model: nextResult.model || item.model,
              report: nextResult.report || "",
              status: "done",
            }
            : item)),
        );
        setActivePage("analysis");
        setMessage(nextResult?.qa?.answer ? "分析结果已返回" : "分析完成");
      })
      .catch((error) => {
        if (error.name === "AbortError") {
          setAnalysisHistory((current) => current.filter((item) => item.id !== turnId));
          return;
        }
        const errorMessage = error.message || "分析失败";
        setAnalysisHistory((current) =>
          current.map((item) => (item.id === turnId
            ? {
              ...item,
              answer: errorMessage,
              references: [],
              mode: "error",
              status: "error",
            }
            : item)),
        );
        setMessage(errorMessage);
      })
      .finally(() => {
        if (analysisControllerRef.current === controller) {
          setAnalysisLoading(false);
          analysisControllerRef.current = null;
        }
      });
  };

  const datasetSummary = dataset || {};
  const inference = dataset?.inferred || {};
  const featureColumns = inference.feature_columns || [];
  const weatherProfile = useMemo(() => buildWeatherProfile(dataset), [dataset]);
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
          <span>驭风智控</span>
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
          <ParticleWindBackground />
          <button className="hero-side-button hero-side-left" type="button" aria-label="返回数据加载" onClick={() => setActivePage("load")}>
            ‹
          </button>
          <button className="hero-side-button hero-side-right" type="button" aria-label="进入DeepSeek分析" onClick={() => setActivePage("analysis")}>
            ›
          </button>
          <div className="start-hero">
            <p className="hero-kicker">Wind Power Forecasting & Intelligent Analysis</p>
            <h1>驭风智控</h1>
          </div>
          <div className="start-grid">
            <button className="start-card" onClick={() => setActivePage("load")} type="button">
              <span className="start-icon doc-icon" aria-hidden="true" />
              <span className="start-card-title">数据加载</span>
              <p>导入样例数据或上传本地风电数据，完成字段识别与数据预览</p>
            </button>
            <button className="start-card" onClick={() => setActivePage("forecast")} type="button">
              <span className="start-icon chart-icon" aria-hidden="true" />
              <span className="start-card-title">预测结果</span>
              <p>查看模型预测曲线、指标对比与误差分析</p>
            </button>
            <button className="start-card" onClick={() => setActivePage("analysis")} type="button">
              <span className="start-icon ai-icon" aria-hidden="true" />
              <span className="start-card-title">DeepSeek分析</span>
              <p>基于预测结果生成诊断报告、关键时刻说明和问答</p>
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
          <SectionTitle kicker="01" title="数据加载" note="导入样例或上传文件后自动识别时间列、目标列和气象特征列" />
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
                <p>支持 CSV / XLSX / XLS，首行需为列名</p>
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
                  {loading ? "处理中" : "开始预测"}
                </button>
              </div>
            </div>
            <WeatherOverview profile={weatherProfile} sourceName={datasetSummary.source_name} timeRange={timeRange} />
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
          <SectionTitle kicker="02" title="预测结果" note="默认使用 iManformer 作为主模型，同时保留 RNN、LSTM 与 Transformer 的对比结果" />
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
                  <Tooltip contentStyle={{ background: "#12262c", border: "1px solid rgba(212,227,230,0.28)", borderRadius: 14 }} />
                  <Legend />
                  <Line type="monotone" dataKey="actual" stroke="#ffffff" strokeWidth={2.6} dot={false} name="真实功率" />
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
                      fill="rgba(106,199,235,0.16)"
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
                <div className="empty-state compact-empty">默认展示 iManformer 指标，开启模型对比后可查看 RNN、LSTM、Transformer 横向结果</div>
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
                  <Tooltip contentStyle={{ background: "#12262c", border: "1px solid rgba(212,227,230,0.28)", borderRadius: 14 }} />
                  <Bar dataKey="our_model_error" fill="#3b83a2" radius={[8, 8, 0, 0]}>
                    {visibleChart.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.our_model_error >= 0 ? "#ffd166" : "#57f0d5"} />
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
          <SectionTitle kicker="03" title="DeepSeek分析" note="输入问题后调用 DeepSeek Chat Completions 接口返回回答，并保留预测指标与分析报告" />
          <div className="analysis-layout">
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
                  onChange={(e) => {
                    const { value } = e.target;
                    setAnalysisQuestion(value);
                    setSelectedQuestion(SAMPLE_QUESTIONS.includes(value) ? value : "");
                  }}
                  placeholder="请输入你想了解的问题，例如：某段误差为什么升高？"
                />
                <div className="question-actions">
                  <button onClick={() => handleAnalysis()} disabled={analysisLoading || !predictResult} type="button">
                    {analysisLoading ? "分析中" : "发送"}
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
            </div>
            <div className="analysis-overview-stack">
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
                  <li><strong>稳定性</strong><span>预测曲线整体跟随真实功率变化</span></li>
                  <li><strong>误差风险</strong><span>重点查看高风速和爬坡区间波动</span></li>
                  <li><strong>影响因素</strong><span>风速、风向和温度变化仍是主要扰动来源</span></li>
                </ul>
              </div>
            </div>
            <div className="panel analysis-panel analysis-conversation-panel">
              <div className="panel-head">
                <h3>会话记录</h3>
                <div className="panel-head-tools">
                  <span>{analysisHistory.length ? `共 ${analysisHistory.length} 轮问答` : "尚未开始对话"}</span>
                </div>
              </div>
              {analysisHistory.length ? (
                <div className="analysis-thread">
                  {analysisHistory.map((item, index) => (
                    <article
                      key={item.id}
                      className={item.status === "error" ? "analysis-turn error" : "analysis-turn"}
                    >
                      <div className="analysis-turn-index">{String(index + 1).padStart(2, "0")}</div>
                      <div className="analysis-turn-card user-turn">
                        <div className="analysis-turn-head">
                          <span>问题</span>
                          <strong>用户输入</strong>
                        </div>
                        <p>{item.question || "未输入具体问题"}</p>
                      </div>
                      <div className="analysis-turn-card assistant-turn">
                        <div className="analysis-turn-head">
                          <span>回答</span>
                          <strong>
                            {item.status === "loading" ? "生成中" : item.provider || "DeepSeek"}
                          </strong>
                        </div>
                        {item.status === "loading" ? (
                          <div className="answer-loading" aria-label="正在生成回答">
                            <span />
                            <span />
                            <span />
                          </div>
                        ) : (
                          <p>{item.answer || EMPTY_ANALYSIS_ANSWER}</p>
                        )}
                        <div className="analysis-turn-meta">
                          <span>{item.mode === "online" ? "在线" : item.mode === "error" ? "失败" : "离线"}</span>
                          <strong>{item.model || DEFAULT_ANALYSIS_MODEL}</strong>
                        </div>
                        {item.references?.length ? (
                          <div className="analysis-references">
                            {item.references.map((reference) => (
                              <span key={`${item.id}-${reference}`}>{reference}</span>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-state compact-empty">
                  发送问题后按时间顺序保留每一轮提问与回答
                </div>
              )}
            </div>
            <div className="panel analysis-panel analysis-report-panel">
              <div className="panel-head">
                <h3>分析报告</h3>
              </div>
              <ReportMarkdown content={analysisResult?.report} />
            </div>
          </div>
        </section>
      )}
    </main>
  );
}

export default App;
