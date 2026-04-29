# Wind Power Forecasting System 🌬️

<div align="center">

[![License](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
![Python](https://img.shields.io/badge/Python-3.8+-blue.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.110+-green.svg)
![React](https://img.shields.io/badge/React-19.2+-61DAFB.svg)

**一个基于深度学习的风电功率预测系统，支持多种预测模型和数据分析**

[功能特性](#功能特性) • [快速开始](#快速开始) • [部署指南](#部署指南) • [API文档](#api文档) • [项目结构](#项目结构)

</div>

---

## 📌 项目简介

Wind Power Forecasting System 是一个全栈应用，用于风电场时间序列数据的上传、预处理和多模型预测对比分析。系统集成了多个深度学习预测模型，提供直观的Web界面和完整的RESTful API。

**核心功能：**
- 📤 上传时间序列数据（CSV/XLSX格式）
- 📊 数据可视化和统计分析
- 🤖 多个预测模型对比
- 📈 预测结果可视化
- 🔍 数据分析和特征提取

## ✨ 功能特性

- **灵活的数据输入**：支持上传本地文件或加载示例数据集
- **多模型预测**：集成多个深度学习预测算法
- **实时预测**：快速的模型推理和结果返回
- **数据分析**：支持国内模型的数据分析功能
- **响应式UI**：现代化的Web界面，基于React和Vite构建
- **高效API**：异步FastAPI后端，支持大文件上传（最大80MB）
- **跨域支持**：完整的CORS配置，支持前后端分离开发

## 💻 系统要求

### 必需环境

| 组件 | 版本要求 | 备注 |
|------|--------|------|
| **Python** | 3.8+ | 建议3.10+ |
| **Node.js** | 16+ | 建议18+ |
| **npm** | 8+ | 或 yarn/pnpm |
| **Git** | Latest | 用于版本控制 |

### 推荐配置

- **操作系统**：Windows 10+、macOS 10.14+、Linux (Ubuntu 20.04+)
- **内存**：8GB+ RAM
- **磁盘**：2GB 可用空间

## 📦 依赖项

### 后端依赖
```
fastapi>=0.110.0          # Web框架
uvicorn[standard]>=0.27.0 # ASGI服务器
pandas>=2.0.0             # 数据处理
numpy>=1.24.0             # 数值计算
openpyxl>=3.1.0           # Excel文件支持
python-multipart>=0.0.9   # 文件上传支持
pydantic>=2.0.0           # 数据验证
```

### 前端依赖
```
react@^19.2.5             # UI库
react-dom@^19.2.5         # React DOM
recharts@^3.8.1           # 图表库
vite@^5.4.21              # 构建工具
typescript@^5.7.0         # TypeScript支持
```

## 🚀 快速开始

### 1️⃣ 克隆仓库

```bash
git clone https://github.com/yourusername/wind-power-forecasting.git
cd wind-power-forecasting
```

### 2️⃣ 后端安装和运行

**创建Python虚拟环境**
```bash
# Windows
python -m venv venv
venv\Scripts\activate

# macOS/Linux
python3 -m venv venv
source venv/bin/activate
```

**安装Python依赖**
```bash
pip install -r backend/requirements.txt
```

**启动后端服务器**
```bash
cd backend
set PYTHONPATH=%cd%  # Windows
# export PYTHONPATH=$PWD  # macOS/Linux
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

✅ 后端运行成功后访问：http://localhost:8000/docs

### 3️⃣ 前端安装和运行

**安装Node.js依赖**
```bash
cd frontend
npm install
```

**启动开发服务器**
```bash
npm run dev
```

✅ 前端运行成功后访问：http://localhost:5173

## 📁 项目结构

```
wind-power-forecasting/
├── backend/                          # 后端应用
│   ├── app/
│   │   ├── __init__.py
│   │   ├── main.py                  # FastAPI应用入口
│   │   ├── api/
│   │   │   └── v1/
│   │   │       ├── __init__.py
│   │   │       └── routes.py        # API路由定义
│   │   ├── core/
│   │   │   ├── __init__.py
│   │   │   └── config.py            # 应用配置
│   │   ├── schemas/
│   │   │   ├── __init__.py
│   │   │   ├── analysis.py          # 分析请求模式
│   │   │   ├── common.py            # 公共响应模式
│   │   │   ├── data.py              # 数据请求模式
│   │   │   └── predict.py           # 预测请求模式
│   │   └── services/
│   │       ├── __init__.py
│   │       ├── ai_analysis.py       # 数据分析服务
│   │       ├── data_loader.py       # 数据加载服务
│   │       ├── metrics.py           # 评估指标
│   │       ├── predict_service.py   # 预测服务
│   │       ├── predictors.py        # 预测器实现
│   │       ├── preprocessor.py      # 数据预处理
│   │       └── storage.py           # 数据存储管理
│   ├── tests/
│   │   └── test_predict_service.py  # 单元测试
│   └── requirements.txt              # Python依赖列表
│
├── frontend/                         # 前端应用
│   ├── src/
│   │   ├── api.js                   # API调用封装
│   │   ├── App.jsx                  # 主应用组件
│   │   ├── main.jsx                 # 应用入口
│   │   └── styles.css               # 样式文件
│   ├── index.html                   # HTML入口
│   ├── package.json                 # Node依赖列表
│   └── vite.config.js               # Vite配置
│
├── data/                            # 数据目录
│   └── (示例数据集)
│
├── models/                          # 预训练模型目录
│
├── scripts/                         # 工具脚本
│   ├── start-backend.ps1            # 后端启动脚本
│   └── start-frontend.ps1           # 前端启动脚本
│
└── README.md                        # 本文件
```

## 📚 API文档

### 基础URL
```
http://localhost:8000/api/v1
```

### 主要端点

#### 1. 健康检查
```http
GET /health
```

**响应示例：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "status": "ok",
    "service": "wind-power-forecasting-api"
  }
}
```

#### 2. 列表示例数据集
```http
GET /data/samples
```

**响应示例：**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "samples": ["sample1.csv", "sample2.xlsx", "sample3.csv"]
  }
}
```

#### 3. 加载示例数据
```http
POST /data/load-sample
Content-Type: application/json

{
  "filename": "sample1.csv"
}
```

**响应示例：**
```json
{
  "code": 0,
  "message": "sample loaded",
  "data": {
    "file_id": "uuid-string",
    "shape": [500, 5],
    "columns": ["timestamp", "power", "wind_speed", ...],
    "preview": [...]
  }
}
```

#### 4. 上传数据文件
```http
POST /data/upload
Content-Type: multipart/form-data

file: <binary file data>
```

**支持格式：** CSV, XLSX, XLS<br>
**最大大小：** 80MB

**响应示例：**
```json
{
  "code": 0,
  "message": "file uploaded",
  "data": {
    "file_id": "uuid-string",
    "shape": [1000, 6],
    "columns": [...],
    "preview": [...]
  }
}
```

#### 5. 运行预测
```http
POST /predict
Content-Type: application/json

{
  "file_id": "uuid-string",
  "model": "lstm",
  "params": {
    "lookback": 48,
    "horizon": 24
  }
}
```

**响应示例：**
```json
{
  "code": 0,
  "message": "prediction completed",
  "data": {
    "predictions": [123.4, 125.6, ...],
    "timestamps": ["2024-01-01 12:00", ...],
    "metrics": {
      "mae": 15.23,
      "rmse": 18.45,
      "mape": 2.5
    }
  }
}
```

#### 6. 数据分析
```http
POST /analysis
Content-Type: application/json

{
  "file_id": "uuid-string"
}
```

**响应示例：**
```json
{
  "code": 0,
  "message": "analysis completed",
  "data": {
    "statistics": {...},
    "correlations": {...},
    "trends": {...}
  }
}
```

**完整API文档**：启动后端后访问 http://localhost:8000/docs (Swagger UI)

## 🚢 部署指南

### 本地开发部署

1. **同时启动后端和前端**
   ```bash
   # 终端1 - 后端
   .\scripts\start-backend.ps1
   
   # 终端2 - 前端
   .\scripts\start-frontend.ps1
   ```

2. **访问应用**
   - 前端：http://localhost:5173
   - 后端API文档：http://localhost:8000/docs

### 生产部署

#### Docker部署

**创建后端Dockerfile**（backend/Dockerfile）：
```dockerfile
FROM python:3.10-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

**创建前端Dockerfile**（frontend/Dockerfile）：
```dockerfile
FROM node:18-alpine as build

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .
RUN npm run build

FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
```

**使用Docker Compose**：
```yaml
# docker-compose.yml
version: '3.8'

services:
  backend:
    build: ./backend
    ports:
      - "8000:8000"
    environment:
      - PYTHONUNBUFFERED=1
    volumes:
      - ./data:/app/data
      - ./models:/app/models

  frontend:
    build: ./frontend
    ports:
      - "80:80"
    depends_on:
      - backend

volumes:
  data:
  models:
```

**启动容器**：
```bash
docker-compose up -d
```

#### Linux服务器部署

1. **安装依赖**
   ```bash
   sudo apt-get update
   sudo apt-get install -y python3.10 python3-pip nodejs npm nginx
   ```

2. **配置Nginx反向代理**
   ```nginx
   upstream backend {
       server 127.0.0.1:8000;
   }

   server {
       listen 80;
       server_name your-domain.com;

       location /api {
           proxy_pass http://backend;
           proxy_set_header Host $host;
           proxy_set_header X-Real-IP $remote_addr;
       }

       location / {
           root /path/to/frontend/dist;
           try_files $uri $uri/ /index.html;
       }
   }
   ```

3. **使用Systemd管理后端服务**
   ```ini
   # /etc/systemd/system/wind-forecasting.service
   [Unit]
   Description=Wind Power Forecasting Backend
   After=network.target

   [Service]
   Type=notify
   User=www-data
   WorkingDirectory=/opt/wind-forecasting/backend
   Environment="PATH=/opt/wind-forecasting/venv/bin"
   ExecStart=/opt/wind-forecasting/venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000

   [Install]
   WantedBy=multi-user.target
   ```

   ```bash
   sudo systemctl daemon-reload
   sudo systemctl enable wind-forecasting
   sudo systemctl start wind-forecasting
   ```

## 🧪 测试

### 运行单元测试

```bash
cd backend
pip install pytest pytest-asyncio
pytest tests/
```

### 测试覆盖率

```bash
pytest --cov=app --cov-report=html tests/
```

## ⚙️ 配置说明

### 后端配置 (backend/app/core/config.py)

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| `api_prefix` | `/api/v1` | API前缀 |
| `max_preview_rows` | `8` | 数据预览行数 |
| `max_upload_mb` | `80` | 最大上传文件大小（MB） |
| `cors_origins` | `["http://localhost:5173"]` | CORS允许域名 |

**修改配置**：编辑 `backend/app/core/config.py`

### 前端配置 (frontend/vite.config.js)

```javascript
export default {
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  }
}
```

## 🧩 使用示例

### 1. 加载示例数据并进行预测

```python
import requests

BASE_URL = "http://localhost:8000/api/v1"

# 列表示例数据
samples = requests.get(f"{BASE_URL}/data/samples").json()
print(samples["data"]["samples"])

# 加载示例
response = requests.post(
    f"{BASE_URL}/data/load-sample",
    json={"filename": "sample1.csv"}
)
file_id = response.json()["data"]["file_id"]

# 运行预测
predict_response = requests.post(
    f"{BASE_URL}/predict",
    json={
        "file_id": file_id,
        "model": "lstm",
        "params": {
            "lookback": 48,
            "horizon": 24
        }
    }
)
print(predict_response.json())
```

### 2. 上传自定义数据

```python
with open("my_data.csv", "rb") as f:
    files = {"file": f}
    response = requests.post(
        f"{BASE_URL}/data/upload",
        files=files
    )
    file_id = response.json()["data"]["file_id"]
    print(f"上传成功，文件ID: {file_id}")
```

## ❓ 常见问题

### Q1: 前端连接后端失败？
**A:** 检查后端是否运行，确认CORS配置中包含前端域名：
```python
# backend/app/core/config.py
self.cors_origins = ["http://localhost:5173", "http://your-domain.com"]
```

### Q2: 上传文件超过大小限制？
**A:** 修改 `config.py` 中的 `max_upload_mb` 值：
```python
self.max_upload_mb = 100  # 改为100MB
```

### Q3: 如何添加新的预测模型？
**A:** 
1. 在 `backend/app/services/predictors.py` 中实现预测器
2. 在 `backend/app/services/predict_service.py` 中注册模型
3. 在前端UI中添加模型选项

### Q4: 如何自定义数据格式？
**A:** 修改 `backend/app/schemas/data.py` 和 `backend/app/services/data_loader.py`

## 🛠️ 开发建议

- ✅ 提交代码前运行 `black` 和 `flake8` 进行代码检查
- ✅ 为新功能添加单元测试
- ✅ 更新API文档（自动生成，访问 `/docs`）
- ✅ 生产环境关闭 `--reload` 和 debug模式

## 🆘 获取帮助

- 📚 完整API文档：http://localhost:8000/docs
- 📝 提交Issue：[GitHub Issues](https://github.com/yourusername/wind-power-forecasting/issues)
- 💬 讨论功能：[GitHub Discussions](https://github.com/yourusername/wind-power-forecasting/discussions)

## 📄 许可证

本项目采用 **MIT License** - 详见 [LICENSE](LICENSE) 文件

## 🤝 贡献指南

欢迎提交 Pull Request！

1. Fork 本仓库
2. 创建特性分支 (`git checkout -b feature/AmazingFeature`)
3. 提交更改 (`git commit -m 'Add some AmazingFeature'`)
4. 推送到分支 (`git push origin feature/AmazingFeature`)
5. 开启 Pull Request

## 🙏 致谢

- 感谢所有贡献者和用户的支持
- 项目灵感来自电气大创项目

---

<div align="center">

**⭐ 如果这个项目对你有帮助，请给个Star！**

Made with ❤️ by [Your Team Name]

</div>
