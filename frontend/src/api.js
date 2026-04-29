const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000/api/v1";

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
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok || payload?.code) {
    throw new ApiError(payload?.message || "请求失败", response.status, payload);
  }
  return payload?.data ?? payload;
}

export async function apiGet(path, { signal } = {}) {
  const response = await fetch(`${API_BASE}${path}`, { signal });
  return parseResponse(response);
}

export async function apiPost(path, body, { signal } = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  return parseResponse(response);
}

export async function uploadDataset(file, { signal } = {}) {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch(`${API_BASE}/data/upload`, {
    method: "POST",
    body: formData,
    signal,
  });
  return parseResponse(response);
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
