const API_BASE = (import.meta.env.VITE_API_BASE_URL || "/api/v1").replace(/\/$/, "");

export class ApiError extends Error {
  constructor(message, status, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

async function parseResponse(response) {
  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      if (!response.ok) throw new ApiError(text || "请求失败", response.status);
      throw new ApiError("接口返回格式不是 JSON", response.status);
    }
  }
  if (!response.ok || payload?.code) {
    throw new ApiError(payload?.message || "请求失败", response.status, payload);
  }
  return payload?.data ?? payload;
}

async function request(path, options) {
  try {
    const response = await fetch(`${API_BASE}${path}`, options);
    return parseResponse(response);
  } catch (error) {
    if (error instanceof ApiError || error.name === "AbortError") throw error;
    throw new ApiError("后端服务未启动或无法访问，请先运行 scripts/start-backend.ps1", 0);
  }
}

export async function apiGet(path, { signal } = {}) {
  return request(path, { signal });
}

export async function apiPost(path, body, { signal } = {}) {
  return request(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
}

export async function uploadDataset(file, { signal } = {}) {
  const formData = new FormData();
  formData.append("file", file);
  return request("/data/upload", {
    method: "POST",
    body: formData,
    signal,
  });
}

export function listSamples(options) {
  return apiGet("/data/samples", options);
}

export function loadSample(filename, options) {
  return apiPost("/data/load-sample", { filename }, options);
}

export function runPredict(payload, options) {
  return apiPost("/predict", payload, options);
}

export function runAnalysis(payload, options) {
  return apiPost("/analysis", payload, options);
}
