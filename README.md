# 风电功率预测可视化系统

面向比赛展示与工程部署的风电预测系统计划书。系统提供可交互网页，支持上传时序数据，调用多个预训练模型进行对比预测，输出预测曲线、误差分析、评估指标与可视化报告，用于突出我方模型方案在风电功率预测任务中的效果优势。

## 1. 项目定位

### 1.1 项目目标

本项目要构建一个可部署、可演示、可扩展的风电预测系统，满足以下目标：

- 用户通过网页上传风电时序数据文件。
- 系统自动完成数据清洗、滑动窗口构造、标准化和推理。
- 页面展示多模型预测结果、真实值对比、误差曲线和核心评估指标。
- 以公开可用的预训练模型作为基线模型。
- 在无法公开我方私有模型权重的前提下，使用一个效果更优的公开预训练模型作为演示版 `Our Model`。
- 支持使用 Codex 持续协作开发、补全代码、部署服务和迭代文档。

### 1.2 演示模式说明

由于我方真实模型暂不提供给仓库，本项目默认采用“演示替身策略”：

- 基线模型：
  - `RNN`
  - `LSTM`
  - `Transformer`
- 展示模型：
  - `Our Model (Demo)`，默认建议使用 `PatchTST` 或 `Informer`

说明：

- 前端与接口层统一把增强模型展示为 `Our Model`。
- 后端实现时应保留清晰注释，说明当前版本为演示代理模型，后续可无缝替换为真实私有模型。
- 模型抽象层要统一输入输出格式，保证未来只替换权重和推理类即可上线真实方案。

### 1.3 核心展示价值

- 对比清晰：同一份输入数据下展示 RNN、LSTM、Transformer 与 `Our Model` 的预测差异。
- 指标直观：至少展示 `MAE`、`RMSE`、`MAPE`、`R2`。
- 图形完整：至少具备真实值-预测值折线图、误差分布图、模型指标柱状图。
- 操作简单：上传数据后，一次点击即可完成预测与结果渲染。
- 部署友好：适合让 Codex 按阶段生成前后端、接口、模型服务与部署脚本。

## 2. 预期用户与使用场景

### 2.1 用户角色

- 指导教师：查看系统完整度、技术路线和展示效果。
- 比赛评委：快速感知模型预测能力和系统工程化水平。
- 团队成员：基于统一接口继续接入真实模型。
- 演示人员：使用网页完成上传、预测、对比和导出。

### 2.2 场景示例

1. 上传某风电场历史功率与气象特征数据。
2. 选择预测长度，例如未来 24 个时间步。
3. 系统同时调用多个预训练模型进行推理。
4. 页面展示各模型预测曲线与真实值曲线。
5. 指标面板突出 `Our Model` 的综合表现。
6. 导出图表截图、CSV 指标表或汇报用摘要。

## 3. 系统范围

### 3.1 本期必须完成

- Web 端数据上传页面
- 预测任务提交与结果轮询
- 多模型统一推理接口
- 预测结果可视化
- 核心指标计算
- 演示环境部署说明
- README 级别的大型项目计划书

### 3.2 可在第二阶段补充

- 用户登录与历史记录
- 异步任务队列
- 模型配置面板
- 报告导出为 PDF
- 多风场数据集管理
- GPU 推理与缓存优化

## 4. 总体架构

```text
+-------------------+       +---------------------+       +----------------------+
| Frontend Web UI   | ----> | FastAPI Backend     | ----> | Model Service Layer  |
| React + ECharts   | <---- | Upload / Predict    | <---- | RNN/LSTM/Trans/Our   |
+-------------------+       +---------------------+       +----------------------+
          |                           |                                |
          v                           v                                v
   交互式图表与指标面板         数据预处理与评估计算             预训练权重与推理封装
```

### 4.1 前端

建议使用：

- `React` 或 `Next.js`
- `TypeScript`
- `ECharts` 或 `Recharts`
- `Ant Design`、`MUI` 或简洁自定义组件

页面建议包括：

- 首页/项目说明
- 数据上传页
- 预测结果页
- 指标看板页
- 模型说明页

### 4.2 后端

建议使用：

- `FastAPI`
- `Pydantic`
- `Uvicorn`
- `pandas`
- `numpy`
- `torch`
- `scikit-learn`

后端职责：

- 接收上传文件
- 校验数据格式
- 完成预处理
- 调用多模型推理
- 计算评估指标
- 返回结构化 JSON 结果

### 4.3 模型层

模型服务建议抽象成统一接口：

```python
class BasePredictor:
    def load(self): ...
    def preprocess(self, df): ...
    def predict(self, x): ...
    def postprocess(self, y): ...
```

推荐模型分工：

- `RNNPredictor`：基础循环网络对照组
- `LSTMPredictor`：常见时序基线
- `TransformerPredictor`：注意力结构基线
- `AdvancedPredictor`：默认映射为 `Our Model`

### 4.4 数据流

1. 用户上传 `CSV` 或 `Excel`
2. 后端校验字段、时间列和目标列
3. 执行缺失值处理、归一化、滑窗切分
4. 各模型推理并输出预测值
5. 统一计算指标
6. 返回前端渲染图表和结果表格

## 5. 推荐目录结构

```text
softerware/
├─ backend/
│  ├─ app/
│  │  ├─ api/
│  │  ├─ core/
│  │  ├─ schemas/
│  │  ├─ services/
│  │  └─ utils/
│  ├─ tests/
│  └─ requirements.txt
├─ frontend/
│  ├─ src/
│  │  ├─ components/
│  │  ├─ pages/
│  │  ├─ services/
│  │  ├─ hooks/
│  │  └─ types/
│  └─ package.json
├─ models/
│  ├─ checkpoints/
│  ├─ rnn/
│  ├─ lstm/
│  ├─ transformer/
│  └─ advanced/
├─ data/
├─ docs/
├─ scripts/
├─ .technical-change-tracker/
└─ README.md
```

## 6. 输入数据约定

### 6.1 推荐字段

- `timestamp`：时间戳
- `wind_speed`：风速
- `wind_direction`：风向
- `temperature`：气温
- `pressure`：气压
- `humidity`：湿度
- `power`：实际功率，作为预测目标

### 6.2 文件格式

- 支持 `CSV`
- 支持 `XLSX`
- 首行必须为列名
- 时间列必须可解析
- 建议按时间升序排列

### 6.3 预处理要求

- 自动处理缺失值
- 进行异常值提示
- 统一归一化策略
- 构造固定长度时间窗口
- 支持多特征输入、单目标输出

## 7. 核心功能设计

### 7.1 数据上传模块

功能要求：

- 拖拽上传
- 文件格式校验
- 样本量与字段预览
- 上传状态反馈

### 7.2 预测模块

功能要求：

- 支持选择预测步长
- 支持选择是否开启全部模型对比
- 提交任务后返回任务 ID
- 显示预测进度或加载状态

### 7.3 指标评估模块

最少输出：

- `MAE`
- `RMSE`
- `MAPE`
- `R2`

建议补充：

- `MSE`
- `SMAPE`
- `Max Error`

### 7.4 可视化模块

至少包含以下图表：

- 真实值与预测值折线图
- 各模型指标柱状图
- 各模型误差箱线图或分布图
- 残差趋势图

### 7.5 展示增强策略

为了更适合汇报展示，建议增加：

- 自动高亮综合最优模型
- 支持单模型显隐切换
- 指标卡片颜色区分优劣
- 对 `Our Model` 给出一句简短优势解释

## 8. API 设计草案

### 8.1 上传数据

`POST /api/v1/data/upload`

返回：

- 文件 ID
- 字段列表
- 行数
- 预览数据

### 8.2 发起预测

`POST /api/v1/predict`

请求体示例：

```json
{
  "file_id": "demo-file-001",
  "target_column": "power",
  "time_column": "timestamp",
  "feature_columns": ["wind_speed", "wind_direction", "temperature"],
  "window_size": 24,
  "horizon": 24,
  "models": ["rnn", "lstm", "transformer", "our_model"]
}
```

### 8.3 查询结果

`GET /api/v1/predict/{task_id}`

返回内容建议包括：

- 各模型预测序列
- 真实值序列
- 指标结果
- 图表渲染所需结构

### 8.4 健康检查

`GET /api/v1/health`

用于 Codex 部署后的联调与验活。

## 9. 前端页面规划

### 9.1 首页

- 项目简介
- 系统亮点
- 模型说明
- 演示入口

### 9.2 数据上传页

- 上传组件
- 数据样例说明
- 参数选择区
- 开始预测按钮

### 9.3 结果页

- 指标卡片区
- 折线图主图
- 误差分析区
- 模型排名区
- 数据导出区

### 9.4 项目说明页

- 为什么使用代理模型
- 如何替换为真实私有模型
- 模型输入输出说明

## 10. 后端实现规划

### 10.1 关键模块

- `data_loader`：读入 CSV/XLSX
- `preprocessor`：数据清洗与窗口构造
- `model_registry`：模型注册与实例管理
- `predict_service`：统一预测入口
- `metrics_service`：评估指标计算
- `result_formatter`：前端响应结构转换

### 10.2 统一响应结构

建议所有接口返回：

```json
{
  "code": 0,
  "message": "success",
  "data": {}
}
```

### 10.3 错误处理

- 文件格式错误
- 列名缺失
- 时间列无法解析
- 模型文件不存在
- 推理失败
- 指标计算异常

## 11. 模型策略

### 11.1 基线模型

`RNN`、`LSTM`、`Transformer` 用于提供传统与通用深度学习基线。

### 11.2 演示增强模型

默认建议：

- 首选 `PatchTST`
- 备选 `Informer`
- 备选 `Autoformer`

推荐理由：

- 这些模型更适合中长期时序预测展示场景。
- 相比简单 RNN/LSTM，通常更容易做出稳定的可视化对比效果。
- 后续替换为真实私有模型时，只需要保留 `our_model` 这条模型通道即可。

### 11.3 模型替换原则

- 前端永远只认模型标识，不直接依赖具体算法名。
- 后端通过注册表把 `our_model` 映射到真实实现。
- 文档中区分“公开演示模型”和“私有正式模型”。

## 12. 评估指标与验收标准

### 12.1 功能验收

- 可以成功上传样例数据
- 可以完成至少 4 个模型的对比预测
- 可以显示真实值与预测值对比曲线
- 可以展示核心指标表
- 可以在浏览器中正常交互

### 12.2 展示验收

- 页面布局整洁，适合投屏汇报
- `Our Model` 结果默认高亮
- 图表切换流畅
- 指标解释清晰，不需要口头补充太多

### 12.3 工程验收

- 前后端能本地启动
- README 足够支持 Codex 接续开发
- 模型接口支持后续替换
- 至少保留一个样例数据集用于演示

## 13. Codex 协作开发计划

推荐把整个项目拆成以下阶段，让 Codex 分轮完成。

### 阶段一：项目骨架

目标：

- 初始化 `frontend` 和 `backend`
- 建立基础目录结构
- 完成 README、环境变量模板与启动脚本

交付物：

- 前端脚手架
- 后端 FastAPI 骨架
- 统一配置文件

### 阶段二：数据处理与接口

目标：

- 完成文件上传
- 支持数据预览
- 实现数据清洗和滑窗
- 定义预测任务请求结构

交付物：

- 上传接口
- 预处理服务
- 接口文档

### 阶段三：模型集成

目标：

- 接入 RNN、LSTM、Transformer、AdvancedPredictor
- 统一模型抽象接口
- 提供测试用权重或伪推理逻辑

交付物：

- 模型注册器
- 多模型推理服务
- 指标计算模块

### 阶段四：前端展示

目标：

- 完成上传页、结果页、指标卡片和图表
- 完成任务状态管理
- 优化汇报展示效果

交付物：

- 交互式页面
- 图表组件
- 接口联调

### 阶段五：部署与验收

目标：

- 编写 Docker 与部署说明
- 增加健康检查
- 完成演示环境打包

交付物：

- `Dockerfile`
- `docker-compose.yml`
- 部署文档

## 14. 适用于 Codex 的执行建议

### 14.1 单轮任务不要太大

建议把任务拆成如下粒度：

- 只搭后端骨架
- 只写上传接口
- 只写一个模型注册器
- 只写一个结果页
- 只接入一类图表

### 14.2 推荐提示词风格

可以直接对 Codex 使用类似提示：

```text
请根据 README 的目录规划，在 backend 中搭建 FastAPI 项目骨架，
包含 app/api、app/services、app/schemas、app/core，
并实现 /api/v1/health 与 /api/v1/data/upload 的基础接口。
```

```text
请根据 README 的模型策略，实现统一 BasePredictor 抽象类，
并补充 rnn、lstm、transformer、our_model 四种注册项，
允许先使用占位推理逻辑，接口保持一致。
```

```text
请根据 README 的前端规划，在 frontend 中搭建 React + TypeScript 页面，
至少包含上传页、结果页、指标卡片、折线图和模型排名区。
```

### 14.3 建议的 Codex 工作流

1. 先让 Codex 读 README 与变更追踪文件。
2. 每次只完成一个明确模块。
3. 每轮结束后更新技术变更记录。
4. 保持接口命名和目录结构稳定。
5. 在接入真实模型前，不改动 `our_model` 对外协议。

## 15. 部署方案

### 15.1 本地开发部署

后端：

- Python 3.10+
- 虚拟环境
- `pip install -r requirements.txt`
- `uvicorn app.main:app --reload`

前端：

- Node.js 18+
- `npm install`
- `npm run dev`

### 15.2 Docker 部署

建议后续补齐：

- 前端 `Dockerfile`
- 后端 `Dockerfile`
- `docker-compose.yml`

基础服务建议：

- `frontend`
- `backend`
- `nginx`
- 可选 `redis`

### 15.3 演示部署要求

- 可在一台普通演示机器启动
- 浏览器可访问网页
- 至少支持一个示例数据文件完整跑通
- 模型响应时间适合现场展示

## 16. 风险与约束

### 16.1 当前约束

- 私有模型不能直接入库
- 现阶段目录已创建，但核心代码尚未落地
- 需要用公开模型代理展示最终效果

### 16.2 主要风险

- 数据格式不统一导致上传失败
- 演示模型指标与预期差异较大
- 前后端接口定义不稳定
- 现场环境依赖不完整

### 16.3 应对策略

- 固定样例数据格式
- 先完成占位权重版本，保证流程打通
- 模型层做严格抽象
- 提前准备离线演示数据和截图

## 17. 后续扩展方向

- 接入真实私有模型权重
- 增加短期与超短期预测模式
- 增加风场对比和历史记录
- 增加报告导出
- 增加模型解释性可视化
- 增加用户权限管理

## 18. 技术变更追踪

本仓库已为 README 规划建立结构化变更追踪文件：

- `.technical-change-tracker/TC-20260429-README-PLAN.json`

后续建议所有重要开发轮次都追加记录，包括：

- 本轮目标
- 修改文件
- 当前状态
- 测试结果
- 下一步任务

## 19. 当前结论

本 README 不是单纯的项目简介，而是本仓库的中文开发计划书与 Codex 协作基准文档。它解决的是“先把大型项目目标、结构、接口、展示逻辑和部署路径讲清楚”，以便后续直接围绕这份文档分阶段生成可运行系统。

如果下一步开始正式开发，建议优先顺序如下：

1. 先搭建 `backend` FastAPI 骨架。
2. 再实现上传、预处理和统一预测接口。
3. 再补 `frontend` 上传页与结果页。
4. 最后接入代理版 `Our Model` 与可视化增强。

## 20. 当前可运行版本

本仓库已补齐一个端到端演示骨架：

- 后端：`FastAPI`，提供 `/api/v1/health`、`/api/v1/data/samples`、`/api/v1/data/load-sample`、`/api/v1/data/upload`、`/api/v1/predict`。
- 前端：`React + Vite + Recharts`，支持选择 `data` 目录样例 Excel、上传 CSV/XLSX、发起多模型预测并展示曲线和指标。
- 数据适配：已按当前 Excel 真实列名自动识别 `Time(year-month-day h:m:s)`、`Power (MW)`、多高度风速/风向、温度、气压、湿度等字段。
- 模型策略：`RNN`、`LSTM`、`Transformer` 和 `Our Model` 目前为演示代理预测器，接口已固定，后续可替换真实权重。

本地启动：

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

```powershell
cd frontend
npm install
npm run dev
```

也可以使用脚本：

```powershell
.\scripts\start-backend.ps1
.\scripts\start-frontend.ps1
```

前端默认请求 `http://localhost:8000/api/v1`。如果后端地址不同，可在 `frontend/.env` 中设置：

```text
VITE_API_BASE_URL=http://localhost:8000/api/v1
```
