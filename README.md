# Wind Power Forecasting System

## 项目简介

本项目是一个风电功率预测全栈系统，当前界面版本命名为“驭风智控”。系统采用前后端分离架构，面向风电数据加载、多模型预测结果展示与 DeepSeek 智能分析三个核心流程。

- `frontend/`：基于 React + Vite 的网页前端
- `backend/`：基于 FastAPI 的后端服务
- `data/`：示例风电场数据

前端默认访问 `http://localhost:5173`，并将 `/api` 请求代理到后端 `http://127.0.0.1:8000`。

## 当前修改说明

### 1. 开始页与视觉风格

- 新增开始页，系统名称呈现为“驭风智控”
- 首页背景改为科技感点云风机场景，包含发光风机、远景风机场和数据波场
- 三个核心入口对应系统流程：数据加载、预测结果、DeepSeek分析
- 点击入口卡片可进入对应功能模块

### 2. 全局 UI 设计

- 全局中文字体使用仿宋，英文使用 Times New Roman
- 主色调围绕 `#12262C`、`#D4E3E6`、`#7CA4B1`、`#3B83A2`、`#949498`
- 全部主要模块统一为蓝色系磨砂玻璃卡片
- 表格、统计卡、输入框、按钮、标签、会话块保持统一的玻璃质感
- 预设提示文案去除口语化和 AI 化表达，改为更正式的系统界面表述

### 3. 数据加载模块增强

数据加载模块新增“气象站信息（当前实况）”界面，会根据已加载数据中的气象特征自动呈现：

- 当前风速
- 风向
- 温度
- 湿度
- 气压
- 天气现象
- 逐小时气象片段
- 极端天气预警

气象风险展示参考中国气象局《气象灾害预警信号发布与传播办法》中的灾害预警思路，重点突出：

- 大风
- 高温
- 寒潮
- 霜冻

参考链接：https://www.cma.gov.cn/gzk/202005/t20200528_1694399.html

### 4. 预测结果模块优化

- 预测趋势曲线改为更适配深蓝背景的高区分度配色
- 真实功率、RNN、LSTM、Transformer、iManformer 使用不同亮色系曲线
- 误差柱状图配色与整体背景保持协调，同时突出正负误差差异

### 5. 本地运行兼容性

- 后端 Pydantic schema 类型标注调整为 Python 3.9 兼容写法
- 后端启动脚本优先使用项目根目录下的 `.venv`
- 前端启动脚本改用 `npm.cmd run dev`，避免 Windows PowerShell 执行策略拦截 `npm.ps1`

## 部署与运行

### 运行环境

- Python 3.8 及以上
- Node.js 16 及以上
- npm

### 1. 安装后端依赖

在项目根目录打开 PowerShell 后执行：

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

### 2. 安装前端依赖

```powershell
Set-Location frontend
npm.cmd install
Set-Location ..
```

### 3. 启动后端

推荐使用仓库脚本：

```powershell
.\scripts\start-backend.ps1
```

手动启动方式：

```powershell
Set-Location backend
$env:PYTHONPATH = (Get-Location).Path
$python = Join-Path (Resolve-Path ..).Path ".venv\Scripts\python.exe"
& $python -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

### 4. 启动前端网页

另开一个 PowerShell，在项目根目录执行：

```powershell
.\scripts\start-frontend.ps1
```

手动启动方式：

```powershell
Set-Location frontend
npm.cmd run dev
```

### 5. 打开页面

- 前端页面：`http://localhost:5173`
- 后端接口文档：`http://127.0.0.1:8000/docs`

保持后端和前端两个进程同时运行，即可在浏览器中访问系统。
