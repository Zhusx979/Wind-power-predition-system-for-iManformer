# 驭风智控

## 项目简介

本项目是一个风电功率预测与分析系统，采用前后端分离架构开发，面向风电场数据加载、多模型预测结果展示与智能分析场景。

- `frontend/`：React + Vite 前端界面
- `backend/`：FastAPI 后端服务
- `data/`：示例风电场数据
- `scripts/`：项目启动与打包脚本
- `release/YufengForecast.exe`：已打包的 Windows 可执行程序

系统主要功能包括：

- 导入风电场样例数据或本地数据
- 展示 RNN、LSTM、Transformer、iManformer 等模型预测结果
- 提供预测误差对比与结果分析
- 支持基于预测结果的智能问答与诊断

## 部署运行

### 方式一：直接运行 EXE

仓库中已提供可执行文件：

```powershell
.\release\YufengForecast.exe
```

运行后程序会启动本地服务，并自动在浏览器打开系统页面。

### 方式二：发布模式运行

如果需要以源码方式运行单入口版本，可在项目根目录执行：

```powershell
.\scripts\start-release.ps1
```

该脚本会先构建前端，再启动后端服务，随后通过浏览器访问：

```text
http://127.0.0.1:8000
```

### 方式三：开发模式运行

开发模式需要分别启动后端和前端。

1. 安装后端依赖

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r backend\requirements.txt
```

2. 安装前端依赖

```powershell
Set-Location frontend
npm.cmd install
Set-Location ..
```

3. 启动后端

```powershell
.\scripts\start-backend.ps1
```

4. 启动前端

另开一个 PowerShell 窗口，在项目根目录执行：

```powershell
.\scripts\start-frontend.ps1
```

5. 打开系统

- 前端页面：`http://localhost:5173`
- 后端接口文档：`http://127.0.0.1:8000/docs`

