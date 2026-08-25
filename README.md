# 宝宝巴士

本地课件整理与生成工具。支持课件、论文、代码等资料，可输出 HTML 课件和 PPTX。

## 特性

- 支持 OpenAI 兼容模型接口，可在设置页测试并保存连接；
- 按大纲和小节生成内容，包含概念说明、例子、公式与易错点；
- 提供术语库、HTML 课件和 PPTX 输出；
- 支持多文件分别生成，或综合去重后合并为一套课件；
- 长课件按页/幻灯片均匀覆盖，多来源公平分配上下文预算；
- HTML 课件提供按语义大纲跳转的侧栏，每个 agenda 显示关键点和页码范围，不逐页堆叠目录；
- PDF 中可识别的表格会重建为可选中、可缩放的 HTML 表格，单元格由提取结果锁定而不是交给模型改写；
- PDF 中可直接提取的插图、散点图和函数图可作为原图嵌入讲解页，资源编号会经过程序校验；
- 计划文件记录来源编号、内容哈希、提取字符数和截断状态；
- 显示当前文件和处理阶段；
- 学习中心和生成结果统一保存在项目的 `data/学习资料/`；
- 任务在后台运行，重新打开页面可继续查看进度；
- 可使用本机 Chrome 或 Edge 检查课件排版。

## 生成耗时与修正策略

- 大纲、小节、小结、术语和内容检查分别设置 token 与超时上限；小节最多重试 1 次；
- 小节生成并发限制为 3，遇到接口限流会按 `Retry-After` 退避；
- HTML 排版最多进行 1 轮定向重生成（总计最多 2 轮），只修正能定位到具体小节的问题；
- 浏览器不可用时跳过排版检查；
- 结果页显示总耗时、模型调用次数、失败次数和生成轮数；
- “简明”模式只压缩表达，不硬裁小节或页数；标准与深入模式同样以讲清资料为准。

## 快速开始

### Windows 轻量桌面版

项目复用 Windows 自带的 Microsoft Edge，不再把 Chromium/Electron 重复装进应用。首次使用需要安装 **Node.js 22.12+** 和 **Python 3**，然后执行：

```bash
npm install
npm run build
```

以后直接双击根目录的 **`宝宝巴士.exe`**：

- C# 原生启动器只有几十 KB，后台启动服务时不会弹出 CMD、VBS 或 HTA；
- Edge 以独立应用窗口打开，只有系统标题栏的一个关闭按钮；
- Edge 使用与日常浏览器隔离的访客会话，不登录账号、不启用同步，也不读取个人收藏夹、密码或浏览记录；
- 关闭窗口会通知本地服务退出；生成任务仍在运行时服务会留在后台，重新双击即可返回；
- “选择文件夹”继续使用 Windows 系统对话框；
- 配置保存在 `%LOCALAPPDATA%/宝宝巴士/`，学习中心、术语库和生成结果统一使用项目的 `data/学习资料/`。

`npm start` 会构建并静默拉起同一个桌面启动器。若 Node 不在 `PATH`，可通过 `BAOBAO_NODE` 指定 `node.exe`，也可以将它放到项目的 `runtime/node.exe`；后者会增加分发体积。

### 开发模式

开发环境需要 **Node.js 22.12+** 和 **Python 3**。

```bash
npm install
npm start            # 构建前端和轻量启动器，然后打开桌面窗口
npm run dev          # 后端 8787 + Vite 5173，浏览器开发模式
```

需要单独调试浏览器前端时：

```bash
npm run dev:web      # 后端 8787 + Vite 5173
```

后端也可以单独运行：

```bash
npm run build
npm run server
```

首次打开进入“设置”，填写接口地址、API Key 和模型名，再测试连接。

## 配置

开发模式下配置保存在项目根目录的 `config.json`；轻量桌面版配置保存在 `%LOCALAPPDATA%/宝宝巴士/`。两种模式的工作资料库都是项目的 `data/学习资料/`。配置首次启动时自动生成：

```json
{
  "port": 8787,
  "dataDir": "<项目>/data",
  "storageDir": "<项目>/data/学习资料",
  "llm": { "baseUrl": "https://api.deepseek.com/v1", "apiKey": "", "model": "deepseek-chat" },
  "edgePath": "",
  "enableSelfCheck": true
}
```

仓库提供不含密钥的 `config.example.json` 作为参考；实际 `config.json` 已加入 Git 忽略规则，不会提交 API Key。

- `storageDir`：固定为 `<项目>/data/学习资料`，旧课件无需迁移即可继续读取；
- `edgePath`：留空时查找本机 Chrome 或 Edge；找不到则跳过排版检查。

## 目录结构

```
server/          后端（纯 Node，零框架）
  pipeline.js    生成流水线（大纲→小节→检查→修正→渲染）
  embedded.mjs   提示词/课件渲染器/PPTX 资产（tools/extract-from-plugin.mjs 从 DSH 插件抽取）
  routes.js      HTTP 路由
client/          前端（Vite + React）
launcher/        轻量 C# 桌面启动器（Edge 应用窗口、服务生命周期）
data/学习资料/   内部资料库（学习中心.html、课程/生成文件）
tools/           脚手架工具
docs/            架构、参考项目和后续路线说明
```

## 说明

- 需要本机有 Python 3（课件文本提取与 PPTX 打包用）；
- 论文 PDF 若公式是图片（非文本层），提取时公式会缺失，概念讲解不受影响；
- PDF 表格提取依赖原文件中的文字层和表格边界；扫描件、复杂合并单元格或纯图片表格可能无法重建；
- 插图仅在 PDF 内含独立可提取图像且与当前知识点相关时嵌入。由纯矢量路径绘制、没有独立图像对象的图暂不自动重绘，避免凭空补图；
- API Key 只保存在本机 `config.json`，不会外发。
- `reference/` 仅用于本地研究，已加入 Git 忽略；第三方来源和许可证见 `THIRD_PARTY_NOTICES.md`。
- 完整架构、四个参考项目的取舍和后续路线见 `docs/architecture-and-reference-review.md`。

## 许可证

宝宝巴士自身代码采用 [Apache License 2.0](LICENSE)。第三方组件和参考项目保留各自许可证，详见 [NOTICE](NOTICE)、[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) 和 `LICENSES/`。

`data/` 中的用户课件、论文、生成结果及其他学习资料不因本项目许可证而获得授权，使用者应自行确认对输入资料和输出内容拥有相应权利。`reference/` 仅供本地研究，不属于发布内容。
