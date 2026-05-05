# Wind Power Forecasting System

## 项目简介

这是一个风电功率预测全栈项目，包含：

- `frontend/`：基于 React + Vite 的网页前端
- `backend/`：基于 FastAPI 的后端服务
- `data/`：示例数据

网页通过前后端分离方式运行：前端默认访问 `http://localhost:5173`，并将 `/api` 请求代理到后端 `http://127.0.0.1:8000`。

## 部署与运行

### 运行环境

- Python 3.8 及以上
- Node.js 16 及以上
- npm

### 1. 安装后端依赖

在项目根目录打开终端后执行：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

如果你使用自己的 Conda 或系统 Python，也可以直接安装 `backend/requirements.txt` 中的依赖。

### 2. 安装前端依赖

```powershell
Set-Location frontend
npm install
Set-Location ..
```

### 3. 启动后端

推荐直接使用仓库自带脚本：

```powershell
.\scripts\start-backend.ps1
```

脚本会自动进入 `backend/` 目录，并以 `127.0.0.1:8000` 启动 FastAPI 服务。

如果需要手动启动，可执行：

```powershell
Set-Location backend
$env:PYTHONPATH = (Get-Location).Path
python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 4. 启动前端网页

另开一个终端，在项目根目录执行：

```powershell
.\scripts\start-frontend.ps1
```

如果需要手动启动，可执行：

```powershell
Set-Location frontend
npm run dev
```

### 5. 打开网页

- 前端页面：`http://localhost:5173`
- 后端接口文档：`http://127.0.0.1:8000/docs`

只要后端和前端两个进程都正常运行，就可以在浏览器中访问网页并使用系统功能。
