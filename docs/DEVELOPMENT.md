# 说戏开发文档

## 1. 项目定位

说戏（Shuoxi）是一个本地优先的 AI 长篇小说写作桌面应用。

核心目标：

1. 正文分段生成，而不是一次性生成整章。
2. 每段生成时尽量读取完整本章正文。
3. 章末同步事件、人物状态和经历。
4. 长篇写作中通过状态账本、认知边界和连续性检查减少错误。
5. 作品数据保存在本机。
6. AI 通过用户自己的 API Key 直连服务商。

## 2. 技术栈

| 层 | 技术 |
|---|---|
| UI | React 18 + TypeScript strict |
| 构建 | Vite 5 |
| 桌面 | Electron 33 |
| 存储 | SQLite WASM（sql.js）+ localStorage + 主进程 JSON |
| 测试 | Vitest |
| 打包 | electron-builder |

Node.js 版本要求：>= 18。

## 3. 目录结构

```text
electron/
  main.cjs            主进程：窗口、单实例、协议、队列持久化
  preload.cjs         安全桥接 API
  appProtocol.cjs     app:// 静态资源服务和 /llm-api 代理

src/
  App.tsx             应用外壳、作品列表、设置状态
  ai.ts               提示词构造与模型请求底层
  aiTask.ts           统一 AI 任务入口、并发限制、用量统计
  aiProfiles.ts       通用 / 写作 / 聊天三档配置
  types.ts            全局类型
  data.ts             默认数据与空作品
  storyState.ts       事件、状态变化、经历、快照、合并
  storyMemory.ts      故事记忆派生
  storyRetrieval.ts   长篇检索
  syncQueue.ts        同步任务队列
  archiveQueue.ts     档案补全队列
  entityArchive.ts    实体深度档案统一入口
  entityFill.ts       实体生成/补全请求
  writingAnchors.ts   本章写作锚点
  syncSettings.ts     同步设置
  skills.ts           内置技能与自定义技能格式
  bookmarks.ts        书签存储
  components/
    Workspace.tsx     写作工作区
    Reader.tsx        阅读模式
    SettingsModal.tsx 设置
    CharacterCardGrid.tsx
    FactionCardGrid.tsx
    SkillsModal.tsx
    BookmarkModal.tsx
    SyncQueuePanel.tsx
    ...

docs/
  DEVELOPMENT.md      本文件
  USER_GUIDE.md       使用教程
  SKILLS.md           技能格式说明

scripts/              端到端与性能脚本
build/                图标与构建配置
```

## 4. 启动与构建

安装依赖：

```bash
pnpm install
```

开发：

```bash
pnpm dev
pnpm electron:dev
```

检查：

```bash
pnpm check
```

检查内容包括：

1. `tsc --noEmit`
2. Vitest
3. Vite 生产构建

构建可运行目录：

```bash
pnpm pack:dir
```

构建安装包：

```bash
pnpm dist
```

构建安装包：

```bash
pnpm dist
```

正式安装包输出：

```text
release/Shuoxi-<version>-setup.exe
```

安装包不包含测试作品、备份和本机数据。

## 5. 运行时架构

```text
React UI
  ↓
业务逻辑（写作 / 同步 / 实体 / 技能）
  ↓
aiTask.ts（统一任务入口）
  ↓
ai.ts / appProtocol / 服务商 API
  ↓
本地数据（SQLite / localStorage / 主进程 JSON）
```

## 6. AI 任务层

文件：`src/aiTask.ts`

职责：

- 任务类型注册；
- 模型档位选择；
- maxTokens；
- temperature；
- 超时；
- 瞬时错误重试；
- 取消信号；
- 全局并发限制；
- 本次运行 token 统计。

任务类型示例：

```text
writing.continue
writing.selection-edit
writing.title
sync.fast
sync.deep
entity.generate
entity.fill
entity.deep-fill
chat.character
analysis.plan
analysis.story
analysis.rescue
```

统一入口：

```ts
runAiTask({ task, apis, messages, ... })
runApiTask(api, { task, messages, ... })
```

约定：

1. 业务组件不直接调用 `streamChat`。
2. 所有 AI 调用都通过任务层。
3. 后台任务使用较低优先级。
4. 全局最多同时执行 2 个 AI 请求。

## 7. 写作上下文

文件：`src/ai.ts` 的 `buildGenerationMessages`。

规则：

- 本章正文 <= 10000 字：带完整本章；
- 本章正文 > 10000 字：带前文摘要、开头约 1600 字、最近约 8000 字；
- 上下文预算默认 24000 tokens；
- 超出预算时按固定顺序丢弃次要区块；
- 当前章节正文优先级最高。

主要区块：

```text
写作风格
当前场景核心角色
当前场景核心势力
事件 / 关系 / 伏笔锚点
本章已有正文
导演指令
本次写作任务
```

## 8. 同步架构

文件：`src/syncQueue.ts`、`src/archiveQueue.ts`。

### 8.1 同步队列

任务字段：

```ts
{
  id, chapterId, chapterTitle, contentHash, content,
  mode: 'fast' | 'full',
  source: 'auto' | 'manual' | 'backfill',
  priority, status, attempts, error, createdAt
}
```

行为：

- 同一章同内容同模式完成后不重复入队；
- 内容变化会替换未完成任务；
- 按优先级和创建时间排序；
- 队列持久化到主进程 JSON。

### 8.2 快速同步

- 使用通用 AI；
- 只要求摘要、事件、状态变化、新实体、线索；
- 上限：事件 2、变化 5、新实体 4；
- 约 8–10 秒/章；
- 不生成角色经历和审查。

### 8.3 深度同步

- 使用写作 AI；
- 完整事件、状态、经历、审查；
- 如果同章已有事件，则走幂等合并：
  - 只补经历和审查；
  - 不重复追加事件；
  - 不用旧状态覆盖新状态。

### 8.4 覆盖度自动深度补全

快速同步结果满足以下条件之一时，自动加入深度补全：

- 事件达到上限，同时状态变化达到上限；
- 新实体达到上限。

可在同步设置关闭。

### 8.5 档案补全队列

同步发现新角色或势力时：

1. 创建占位档案；
2. 加入档案队列；
3. 同步队列跑完后串行执行；
4. 只补空白字段；
5. 应用时再次读取最新实体，避免覆盖用户手写内容；
6. 可暂停。

## 9. 数据模型

核心类型在 `src/types.ts`。

主要数据：

- `Work`：作品；
- `Chapter`：章节；
- `WorkDetail`：人物、势力、地点、事件、记忆、关系；
- `CharacterCard` / `FactionCard`：实体档案；
- `StoryStateEvent`：章节事件；
- `CharacterExperience`：角色经历；
- `SyncJob` / `ArchiveJob`；
- `SkillDefinition`。

### 数据来源

| 数据 | 来源 |
|---|---|
| 正文 | 用户 / AI 续写 |
| 章节摘要 | 本地摘要 / 同步 |
| currentSummary | 同步 |
| storyStateEvents | 同步 |
| storyThreads | 由事件派生 |
| storyMemory | 派生，只读 |
| profile | 实体生成 / 补全 / 导入 |
| experiences | 深度同步 |
| 书签 | localStorage |

## 10. 本地存储

- 故事库：SQLite WASM（sql.js）；
- 设置：localStorage；
- 同步队列：主进程 JSON；
- 书签：localStorage；
- 自定义技能：localStorage；
- 备份：应用内项目备份。

Windows 用户数据目录：

```text
%APPDATA%\说戏
```

## 11. 技能系统

文件：`src/skills.ts`、`src/components/SkillsModal.tsx`。

内置技能：

1. 场景诊断；
2. 对白打磨；
3. 连续性审查；
4. 局部润色；
5. 章节收尾。

技能字段：

```ts
{
  id, name, description,
  category: '检查' | '润色' | '结构' | '自定义',
  output: 'advice' | 'rewrite',
  profile: 'writing' | 'general',
  instructions: string,
  tools: SkillToolName[],
  resources?: { name, text }[],
  builtin?: boolean,
  version: number
}
```

可用工具声明：

```text
chapter
selection
characters
story_state
recent_chapters
stats
```

工具不是外部执行器，而是本地数据注入器。

详见 [SKILLS.md](SKILLS.md)。

## 12. 设置

`SettingsModal.tsx` 分页：

- 模型：三档 AI、API、Embedding、价格；
- 外观：主题、强调色、背景、排版；
- 角色聊天：聊天行为与记忆；
- 同步：自动同步、间隔、深度补全、自动补档、后台暂停、AI 运行状态；
- 数据：备份、恢复、诊断、清理；
- 用量：模型调用记录。

## 13. 安全与隐私

- API Key 保存在本机；
- 作品数据不上传第三方，只发送给用户配置的模型 API；
- 导入技能只允许声明式数据工具，不执行脚本；
- 不自动修改正文，技能输出只供参考/复制；
- 正式安装包不携带示例作品。

## 14. 测试

```bash
pnpm test
pnpm test:longrun
```

端到端脚本：

```bash
pnpm test:e2e
pnpm test:e2e:backup
pnpm test:e2e:save
pnpm test:e2e:find
```

## 15. 扩展指南

### 新增一个 AI 任务

1. 在 `AiTaskType` 增加任务类型；
2. 在 `AI_TASKS` 配置 profile / maxTokens / temperature / timeout / retries；
3. 通过 `runAiTask` 或 `runApiTask` 调用；
4. 为提示词构造和解析增加测试。

### 新增一个写作技能

1. 在 `BUILTIN_SKILLS` 增加定义；
2. 声明 tools；
3. 编写 instructions；
4. 加测试；
5. 无需新增 UI。

### 新增一个内置技能工具

1. 在 `SkillToolName` 增加名称；
2. 在 `SKILL_TOOL_LABELS` 增加显示名；
3. 在 `buildSkillToolSections` 注入数据；
4. 更新文档。

## 16. 发版检查清单

1. `pnpm check` 全绿；
2. 安装包 smoke test；
3. 确认无端口监听；
4. 确认书架无测试作品；
5. 更新版本号；
6. 更新 README / TODO / docs；
7. 打包安装包；
8. 打源码包；
9. 备份源码。

## 17. 已知限制

- AI 不能保证完全正确；
- 长篇仍需要作者校对；
- 自定义技能不支持脚本执行和外部网络；
- 同步质量取决于模型；
- 纯净版和日常版不能同时运行（单实例锁）。
