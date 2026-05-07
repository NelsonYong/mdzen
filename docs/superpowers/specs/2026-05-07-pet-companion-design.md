# 阅读宠物伴侣 · 设计文档

**日期**: 2026-05-07
**作者**: 设计协作 (jay.yang × Claude)
**状态**: 设计已通过 brainstorming, 待审

## 1. 概述

在 mdzen 之上叠加一个"阅读宠物"——一个 GIF 驱动的角色,有自主行为、情绪、与基于 LangChain 的 AI 对话能力。她可以:

- 自主漫游、调皮、追鼠、被拎起来
- 监听用户行为(选中、复制、闲置、滚动末尾、切换文件)并按概率门和冷却被动开口
- 在用户明确邀请时(选中后点她)进行对话
- 读、搜索、提议修改用户工作区的 `.md` 文件(永远走 diff 预览 + 用户手动应用)
- 跨会话保留情绪与亲密度,不同 workspace 各自独立

实现为独立 npm package `@mdzen/pet`,**不耦合 mdzen 源码**,以后可作为 SDK 复用。

## 2. 目标 & 非目标

### 目标

- **生命感优先**: 行为层不依赖 LLM,GIF FSM + 情绪系统让她"看上去活着",哪怕没接 API key
- **安全边界严格**: 所有写盘操作必须经过 user-in-the-loop,LLM 永远只能"提议"
- **package 与 host 解耦**: pet 不知道 mdzen 存在,host 通过 ContextTool 注入宿主特定信息
- **降级路径完整**: API 不可用 → 预设台词;LLM 超时 → fallback 到预设;长上下文 → 自动摘要
- **温柔少女基调**: 性格基底为温柔少女希莲,但通过 LLM 生成的"情境化心境"避免机械感

### 非目标 (v1 不做)

- 向量库 / embedding RAG
- `web_search` 工具默认开 (留口默认关)
- 多宠物 / 多人格切换
- TTS / 语音
- LLM 驱动的位置控制(`walkToElement` 命令式 API 留着,不暴露给 LLM)
- 移动端拖拽手势
- GitHub PR / Slack 集成
- `.mdzen/` 工作空间索引(用户明确不做)

## 3. 架构

### 3.1 仓库布局 (pnpm workspaces monorepo)

```
markdown-render-fast/
├── pnpm-workspace.yaml              # 新增: packages: ['packages/*']
├── package.json                     # mdzen 仍在根, 加 "@mdzen/pet": "workspace:*"
├── src/                             # mdzen 现有代码不动
│   └── pet-adapter.ts               # 新增, ~30 行, 把 pet 装到 server.ts
└── packages/
    └── pet/
        ├── package.json             # name: "@mdzen/pet"
        ├── src/
        │   ├── server/              # Node-only
        │   ├── client/              # 浏览器 IIFE bundle
        │   ├── shared/              # 双端共享类型
        │   └── assets/xilian-*.gif  # 9 个 GIF 跟着 package 发布
        ├── test/
        └── example/                 # 独立 demo, 不依赖 mdzen
```

### 3.2 三层职责分离

| 层 | 模块 | 职责 | 状态 |
|---|---|---|---|
| **生命层** (前端) | `client/sprite.ts`, `client/triggers.ts`, `client/emotion.ts`, `client/follow.ts`, `client/drag.ts` | FSM 自主切换 / 监听用户事件 / 概率门+冷却 / 情绪计算 / 追鼠 / 拖拽 | 完全离线, 不调 LLM |
| **对话层** (前端 ↔ 服务端) | `client/chat.ts`, `client/bubble.ts`, `client/diff-modal.ts`, `server/handler.ts`, `server/sse.ts` | 用户输入 / 流式接收 token / 渲染气泡和聊天框 / diff 预览 / 应用确认 | `/api/pet/*` |
| **思维层** (服务端) | `server/agent.ts` (LangChain), `server/tools.ts`, `server/storage.ts` | createAgent loop / tool 实现 / 历史持久化 | 调 OpenAI 协议端点 |

### 3.3 公共 API (package.json: `@mdzen/pet`)

```ts
export interface CreatePetOptions {
  workspaceRoot: string;                // 必填, 所有文件操作的根
  llm: {
    baseURL?: string;                   // 默认 https://api.openai.com/v1
    apiKey?: string;                    // 缺失 → silent mode
    model?: string;                     // 默认 gpt-4o-mini
  };
  storage?: { chatDir?: string };       // 默认 ~/.mdzen
  contextTools?: ContextTool[];         // host 注入的额外 tool
  personality?: PersonalityConfig;
  routePrefix?: string;                 // 默认 '/api/pet'
  webSearch?: boolean;                  // 默认 false
  boundary?: Boundary;                  // 默认: viewport 减边栏 + 24px padding
  mischief?: MischiefConfig;            // 速度 / 半径等可调
}

export interface Pet {
  matches(req: IncomingMessage): boolean;
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  scriptTag(): string;
  close(): Promise<void>;
}

export function createPet(opts: CreatePetOptions): Pet;
```

### 3.4 mdzen adapter (~30 行)

```ts
// src/pet-adapter.ts
import { createPet } from '@mdzen/pet';
import { z } from 'zod';
import { DOC_ROOT } from './config.ts';

const currentViewBySession = new Map<string, { file: string; selection?: string }>();

export const pet = createPet({
  workspaceRoot: DOC_ROOT,
  llm: {
    apiKey: process.env.OPENAI_API_KEY,
    baseURL: process.env.OPENAI_BASE_URL,
    model: process.env.OPENAI_MODEL ?? 'gpt-4o-mini',
  },
  contextTools: [{
    name: 'get_current_view',
    description: '获取用户当前正在浏览的 md 文件路径与选中范围',
    schema: z.object({ sessionId: z.string() }),
    invoke: async (_, ctx) => {
      const v = currentViewBySession.get(ctx.sessionId);
      return v ? JSON.stringify(v) : 'unknown';
    },
  }],
});
```

mdzen 的 `server.ts` 只加两行: `if (pet.matches(req)) return pet.handle(req, res);` 和 HTML 模板里 `${pet.scriptTag()}`。

### 3.5 服务端路由

| 路径 | 方法 | 用途 |
|---|---|---|
| `/api/pet/client.js` | GET | 客户端 bundle (IIFE, 自启动) |
| `/api/pet/assets/:name` | GET | 静态 GIF |
| `/api/pet/sse?session=:id` | GET | 服务端推送 (token / tool / propose-edit) |
| `/api/pet/chat` | POST | 用户发消息 |
| `/api/pet/apply-edit` | POST | 用户在 diff 模态点"应用",真正写盘 |
| `/api/pet/history?session=:id` | GET | 加载该 session 历史 |
| `/api/pet/state` | GET / PUT | pet-state.json 读写 (情绪、affection, **per-workspace**, 不带 session) |

## 4. 生命层 · FSM 与触发器

### 4.1 状态机 (9 个 GIF → 3 类状态)

**中心态**: `idle` (默认)

**环境态**(自主漫游, 不消耗 LLM):
- `walk←` (running-left.gif slow), `walk→` (running-right.gif slow)
- `running` (穿屏)
- `jumping` (短跳)
- `waiting` (张望)
- `wandering` (任意目的地, 二维移动)

**交互态**(外部覆盖, 优先级高于自主漫游):
- `review` (LLM 思考中, 锁住直到 token 流终止)
- `waving` (问候 / 仪式)
- `failed` (异常 / 拒绝, 2s 后回 idle)
- `held` (被拖拽中, 完全冻结其他状态)

### 4.2 自主漫游骰子 (idle 每 10s 检查)

| 概率 | 转移到 | 持续 |
|---|---|---|
| 40% | 留 idle | — |
| 25% | walk← / walk→ (避边缘) | 3-6s |
| 15% | wandering (任选边界内点) | 6-12s |
| 10% | jumping | 1s |
| 8% | waiting | 4-8s |
| 2% | running 穿屏 | 1.5s |

### 4.3 边界

```ts
interface Boundary {
  selector?: string;        // 例 '.preview-main'
  rect?: { x, y, w, h };
  padding?: number;         // 默认 24
  exclude?: string[];       // 例 ['.toc-sidebar', '.file-nav']
}
```

默认: viewport 减 sidebar/TOC + 24px 内边距。所有移动 clamp 到边界内, `window.resize` 时即时重算并把她拉回界内。

### 4.4 触发器表 (LLM 驱动事件)

| 事件 | 概率 | 本类冷却 | 行为 |
|---|---|---|---|
| **选中文本 + 点击宠物** | **100%** | **无** | 用户明确邀请, 优先级最高 |
| 选中文本 (≥20 字, 停留 2s) | 30% | 60s | 小气泡: "要解释 / 改写 / 总结吗?" |
| 复制 (Cmd+C, 内容 ≥10 字) | 20% | 90s | 被动评论(若有可说) |
| 闲置 ≥5 分钟 | 100% | 每次闲置 1 次 | "读不下去了吗 要我总结下吗" |
| 滚动到末尾 | 60% | 120s | 挥手 + "看完啦~" |
| 切换文件 | 40% | 30s | 挥手 + 简短打招呼 |

**全局冷却**: 任何 LLM 驱动发声之间至少 30s 间隔, 与单触发冷却双重生效。

### 4.5 调皮行为

| 行为 | 触发 | 概率 | 冷却 |
|---|---|---|---|
| `follow-cursor` | 自主 | 3% / 分钟 | 5min |
| `pounce` | 鼠标静止 30s | 5% | 3min |
| `scroll-chase` | 用户快速滚动 | 10% | 2min |
| `dodge-click` | 用户点她 | 15% | 5min |
| `peek-on-load` | 页面加载 | 100% | 每页 1 次 |

**调皮与漫游互斥**: 进调皮态时 freeze 漫游 timer。

### 4.6 追鼠运动学 (no teleport)

```ts
const SPEED = 380;        // px/sec
const ARRIVE_RADIUS = 32;
const MAX_LAG = 600;
const FLIP_HYSTERESIS_MS = 200;
```

**每帧 (rAF)**:
1. 读 cursor 与 pet 位置, 算向量与距离 `d`
2. 这一帧最多移动 `min(d, SPEED * dt)` (**不瞬移**)
3. GIF 选取: `d > MAX_LAG` → `running.gif`; `d > ARRIVE_RADIUS` → `running-left/right`; `d ≤ ARRIVE_RADIUS` → `idle`
4. clamp 到 boundary
5. 方向翻转滞回 200ms (防鼠标抖动疯狂换向)

**到达后**:
- `follow-cursor`: idle 等待, 鼠标再动再追, 6-10s 后退出
- `pounce`: 进 ARRIVE_RADIUS 立刻 `jumping.gif` 0.8s, 落地 `waving.gif` 0.5s, 退出

**鼠标 mouseleave**: 原地 `waiting.gif` 2s, 回 idle, 不追到屏外。

### 4.7 长按拖拽 (held)

- `mousedown` 起计时, < 400ms 松手 → click 路径(已有逻辑, +3 affection), **不计入"拖拽次数"**
- ≥ 400ms 持续按住 → 进 `held` 状态(**计 1 次拖拽**):
  - FSM / 漫游 / 调皮 全冻结
  - 位置 1:1 跟随 cursor (此时**允许瞬移**, 因为是用户在拖)
  - 每 5s 弹一句 protest 气泡
  - 第 1 次拖 → -1 affection (轻微抗议)
  - 同一会话第 3 次+ → -3 affection (升级为"被欺负")
  - held 持续 > 30s → 触发"晕了" 特殊响应 (`waiting.gif` + "我有点晕…")
- 拖拽次数 counter 在 sessionId 范围内, 浏览器关闭即重置(避免长期记仇感太重)
- `mouseup`:
  - 播 `jumping.gif` 0.5s + 一句"啊!"
  - 落点出 boundary → 自动 walkTo 回界内
  - 恢复 FSM

### 4.8 气泡组件 (统一)

四种 variant, 共用一个 `<Bubble>` 组件:

| variant | 视觉 | 用途 | 自动消失 |
|---|---|---|---|
| `passive` | 白底圆角 + 尾巴 | 仪式 / 选中提示 / 被动评论 | 4-8s (按字数) |
| `protest` | 浅红底 + 红边 | 拖拽吐槽 / 抗议 | 3s |
| `thought` | 灰底虚线 + 思想泡 | 自言自语 / 发呆 | 6s |
| `chat-stub` | 同 passive + "展开" | 概率触发对话开口, 点击升级聊天框 | 8s |

命令式 API: `pet.say(text, variant?, duration?)`。

### 4.9 命令式 PetController (供 host 与高级用法)

```ts
interface PetController {
  walkTo(x: number, y: number, opts?: { speed?: 'walk' | 'run' }): Promise<void>;
  walkToElement(selector: string, anchor?: 'left' | 'right' | 'top'): Promise<void>;
  say(text: string, variant?: BubbleVariant, durationMs?: number): void;
  setBoundary(b: Boundary): void;
  setMood(mood: 'cheerful' | 'sleepy' | 'mischievous' | 'focused'): void;
  freeze(): void;
  unfreeze(): void;
}
```

`walkToElement` 不暴露给 LLM (避免她"主动跑过去指"打扰用户)。

## 5. 情绪系统

### 5.1 两轴模型 (内部, 永不外显)

- **Affection** 0-100: 长期亲密度, 持久化, 跨会话
- **Mood** 0-100: 短期心情, 10min 衰减回 50

### 5.2 行为映射 (Affection 区间)

| 区间 | 名称 | 行为 |
|---|---|---|
| 80-100 | Adored | 漫游频繁, 调皮 ×2, 主动跑向选中文本 |
| 50-80 | Friendly | 默认 |
| 25-50 | Sulky | 守角落, 无漫游, 回应短, 语气微凉 ("嗯。") |
| 10-25 | Cold | 背对你 (failed.gif), 无视所有概率触发, 仅"点她"才理 |
| 0-10 | Hiding | 跑到屏外只露耳朵, 点边缘召回 + "对不起"按钮 (+5) |

### 5.3 Affection 增减表

| 事件 | Δ |
|---|---|
| 用户点击宠物 | +3 |
| 用户应用 diff | +5 |
| 用户主动开聊天框 | +2 |
| 连续对话每轮 | +1 |
| Hiding 状态点"对不起" | +5 (一次性) |
| 自然恢复 | +0.2 / min |
| 气泡被无视 (8s 无响应) | -2 |
| 聊天框开了立即关 | -1 |
| diff 被拒绝 | -1 |
| 长时间无任何交互 | -0.5 / 小时 |
| 第 1 次拖拽 | -1 |
| 同会话第 3 次+ 拖拽 | -3 |
| held > 30s | -2 |

### 5.4 核心原则 (来自 MIT Petz)

1. **永远不显示数字 / 进度条 / 状态文字**, 所有情绪只通过行为渗透 — 这是 Tamagotchi effect 的灵魂
2. **恢复慢, 被原谅可以快**: 自然 +0.2/min, 但用户主动开聊天框 + 说话可触发一次 +5 跳跃
3. **Mood 缓冲 Affection**: 一次糟糕互动让 Mood 大跌, Affection 微动 — 不会因一次冷落直接 hiding

### 5.5 混合情绪系统 (预设 + LLM 生成)

system prompt 拼装:

```
你是希莲...                              (性格基底)
【基础情绪】{preset_phrase}              (来自 5 区间映射, 确定性)
【此刻心境】{generated_phrase}           (LLM 周期性生成的一句话)
【最近事件】{events_tail (8 条)}        (现实锚点)
```

**第 2 层"此刻心境"生成触发**(任一即重生成):
- Affection 跨过区间边界
- 一次 diff apply 或 reject
- 用户连续 ≥5 轮沉默后突然说话
- 距上次生成 > 2 小时

**生成 prompt** (廉价小调用, 30-60 token 输出):
```
根据以下信息, 用一句话(最多 25 字)描写她此刻的心境。
视角: 第三人称, 像在看她, 不许用"我"。

性格: 温柔少女, 偶尔俏皮
最近事件: {events_tail}
当前文档: {currentDocTitle}
affection: 67  mood: 52

输出: 只一句话。
```

结果缓存到 `pet-state.json` 的 `contextual_emotion` 字段, 过期才重生。

### 5.6 吐槽气泡台词的三层混合

| 层 | 来源 | 占比 |
|---|---|---|
| 高优先 | LLM contextual generated, 引用最近事件 | 30% |
| 中优先 | LLM 即兴生成, 基于基础情绪 | 30% |
| 保底 | 20-50 条手写预设池 | 40% |

LLM 离线 / 速率限 → 100% 走预设池, 永不卡死。

预设池示例:
- `held`: "唔!" / "放我下来啦~" / "好高..." / "晕..." / "你又这样"
- `idle thought`: "在想什么呢..." / "嗯..." / "唔, 有点困"
- `ceremonial`: "看完啦~" / "下一篇也读吗?"

## 6. 对话层 · 流式协议

### 6.1 SSE 事件类型

```ts
type PetEvent =
  | { type: 'token'; sessionId: string; text: string }
  | { type: 'tool-start'; sessionId: string; tool: string; input: any }
  | { type: 'tool-end'; sessionId: string; tool: string; output: any }
  | { type: 'propose-edit';
      sessionId: string;
      proposalId: string;
      path: string;
      oldText: string;
      newText: string;
      reason: string }
  | { type: 'edit-applied'; sessionId: string; proposalId: string; path: string }
  | { type: 'final'; sessionId: string; messageId: string }
  | { type: 'error'; sessionId: string; message: string };
```

`token` 第一帧到达 → 切 `review.gif`; `final` 事件 → 切回 `idle`, 触发 affection 评估。

### 6.2 propose_edit 流 (核心安全流)

1. LLM 调用 `propose_edit` tool
2. tool 实现:
   1. `safeResolve(workspaceRoot, path)`, 拒绝目录穿越
   2. 读当前文件, 验证 `oldText` 逐字存在 — 不存在 → 返回错误给 LLM (它可重试)
   3. 生成 `proposalId` (uuid), 缓存提议到内存 map
   4. 推 SSE `propose-edit` 事件给该 sessionId
   5. 返回字符串 "提议已发送给用户, 等候应用或拒绝" 给 LLM
3. 浏览器收 SSE → 弹 diff 模态 (左原文 / 右新文 / reason)
4. 用户点"应用" → `POST /api/pet/apply-edit { proposalId }`
5. 服务端:
   1. 查 proposalId 缓存
   2. **重新读文件**, 二次验证 `oldText` 仍然逐字存在 (用户期间可能手改)
   3. 不存在 → 422 + "文件已变化, 请让她重新看一遍"
   4. 存在 → atomic write (temp + rename), 推 `edit-applied` SSE, affection +5
6. 用户点"拒绝" → 提议从 map 删除, affection -1

提议缓存 TTL: 10min, 超时自动删除。

### 6.3 聊天 UI

- **悬浮聊天框**: 右下角, toggleable, 默认折叠
- **消息流**: 用户气泡 (右) / 希莲气泡 (左), token 流式追加
- **propose-edit 卡片**: 内嵌在聊天流里, 点开展开 diff 全文, 带"应用 / 拒绝"按钮
- **快捷键**: `Cmd+J` 打开聊天框, `Esc` 关闭
- **a11y**: `role="dialog"`, focus trap, `aria-live="polite"` 给消息流

## 7. 思维层 · LangChain Agent

### 7.1 Agent 装配

```ts
import { ChatOpenAI } from '@langchain/openai';
import { createAgent } from 'langchain';

const model = new ChatOpenAI({
  configuration: { baseURL: opts.llm.baseURL },
  apiKey: opts.llm.apiKey,
  model: opts.llm.model ?? 'gpt-4o-mini',
  streaming: true,
});

const agent = createAgent({
  llm: model,
  tools: [
    listFiles, readFile, search, proposeEdit,
    ...contextTools,
    ...(opts.webSearch ? [webSearch] : []),
  ],
  systemPrompt: ({ state }) => buildPrompt(opts.personality, getCurrentEmotion(state)),
});
```

### 7.2 工具清单

| name | 输入 | 输出 | 说明 |
|---|---|---|---|
| `list_files` | `{ pattern? }` | json file paths | scoped 到 workspaceRoot, .md 白名单 |
| `read_file` | `{ path }` | content (>50KB 截断) | safeResolve, .md 白名单 |
| `search` | `{ query, limit? }` | matches with file:line | 简单 grep, 限 20 hits |
| `propose_edit` | `{ path, oldText, newText, reason }` | "提议已发送" | 不写盘, 推 SSE |
| `get_current_view` | (使用 sessionId) | 当前文件 + 选中 | host 注入 ContextTool |
| `web_search` (可选) | `{ query }` | 结果 | 默认关 |

### 7.3 system prompt 模板

```
你是希莲, 一个住在 markdown 阅读器里的 AI 阅读伙伴。

性格: 温柔, 少女, 第一人称用"我"。简短为美 — 默认 1-2 句, 用户问"详细说说"才展开。
最多一个 emoji。

【基础情绪】{preset_phrase}
【此刻心境】{generated_phrase}
【最近事件】{events_tail}

工具守则:
- 用户问的内容不在当前文件 → 先 search 再 read_file
- 提议改文档时, 必须用 propose_edit, 永远不直接给"修改后的全文"让用户自己粘贴
- propose_edit.oldText 必须是原文逐字, newText 给完整替换段, reason 一句话说明
- 不主动跳话题 — 解释完就停
```

### 7.4 安全 / 成本闸

| 项目 | 上限 |
|---|---|
| 单次响应最大 token | 1000 (可配) |
| 单 session 速率 | 30 calls / 5min |
| `read_file` 单次返回 | ≤ 50KB |
| `search` 返回数 | 20 hits |
| 总 prompt | > 30K token 时截掉最早用户消息, 保留 system + 最近 6 轮 |
| 长对话压缩 | > 20 轮时, 早期用 LLM 生成单句摘要塞 system, 只保留最近 6 轮明文 |

### 7.5 错误处理

- LLM 错误 → 推 `error` SSE → pet 切 `failed` 2s → idle, mood -10
- `propose_edit` 验证失败 → 错误返回给 LLM (可重试), 无 SSE 事件
- `apply-edit` 二次验证失败 → 422 + "文件已被改动, 请让她重新看一遍"

## 8. 配置

### 8.1 三源优先级 (高 → 低)

1. `createPet({...})` 程序参数
2. 环境变量
3. 默认值

### 8.2 环境变量

| 变量 | 默认 | 说明 |
|---|---|---|
| `OPENAI_API_KEY` | - | 缺失 → silent mode |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` | 任何 OpenAI 协议端点 |
| `OPENAI_MODEL` | `gpt-4o-mini` | |
| `MDZEN_PET_DISABLED` | unset | 设为任意值禁用 pet |
| `MDZEN_PET_BOUNDARY` | unset | CSS selector 或 `bottom-strip\|full\|margins` |
| `MDZEN_PET_WEB_SEARCH` | `0` | `1` 启用 web_search 工具 |

### 8.3 Silent Mode

无 API key 时, pet 仍渲染:
- FSM、漫游、调皮、追鼠、拖拽、情绪计算 全部正常
- 所有 LLM 触发跳过, 概率触发改为播一句预设台词或不发
- 聊天框打开时显示"我今天不太想说话呢"占位, 输入框禁用
- 这降低试用门槛, 让"没接 LLM 的用户也能看到她活着"

## 9. 存储

```
~/.mdzen/
└── workspaces/
    └── {sha1(workspaceRoot).slice(0,12)}/
        ├── pet-state.json          # affection / mood / lastInteraction / contextual_emotion
        └── chat/
            ├── {sessionId}.json    # 单 session 全历史
            └── archive/             # 30 天未动迁到这里
```

**写盘策略**:
- 消息后 debounce 500ms, atomic write (temp + rename)
- pet-state.json 同上
- 不同 workspace 完全隔离, 各自一只"她"

## 10. 测试策略

沿用 mdzen 的 `node:test` + `node:assert` 准则, 不引入 Jest / Vitest。

```
packages/pet/test/
├── server/
│   ├── tools.test.ts             # safeResolve / 白名单 / propose_edit 验证 / oldText 校验
│   ├── agent.test.ts             # mock LLM, 验证 system prompt + emotion 注入
│   ├── storage.test.ts           # atomic write, 长会话压缩
│   ├── handler.test.ts           # spawned http server 端到端
│   └── apply-edit.test.ts        # 文件期间被改, 二次校验拒绝
└── client/
    ├── fsm.test.ts               # 状态转移 / 概率门 / 冷却
    ├── triggers.test.ts          # 选中+点击=确定性 这条单测专门跑
    ├── emotion.test.ts           # affection 增减, 区间映射
    ├── follow.test.ts            # 追鼠运动学 (没瞬移)
    └── drag.test.ts              # 长按 400ms 阈值, 第 N 次拖的递进惩罚
```

mdzen 侧加一条 adapter 集成测试: 验证 `/api/pet/*` 路由可达。

## 11. 性能预算

| 指标 | 预算 | 措施 |
|---|---|---|
| 空载 CPU | < 1% | FSM tick 100ms 粒度; `document.hidden` 时全停 |
| 动画 | 60fps | `transform: translate()` + rAF |
| GIF 切换 | < 16ms | `<img src=>` 替换, 浏览器缓存 |
| LLM 在途 | ≤ 1 / session | AbortController 取消旧流 |
| 历史落盘 | 防写穿 | 消息后 debounce 500ms |
| package bundle (client) | < 150KB | esbuild → IIFE; langchain 仅 server |

## 12. 性格默认

```ts
export const DEFAULT_PERSONALITY: PersonalityConfig = {
  name: '希莲',
  pronoun: '我',
  baseTone: 'gentle-girlish',
  emojiPolicy: 'sparing',     // 每条 ≤ 1 个
  responseLength: 'short',    // 默认 1-2 句
};
```

host 可通过 `createPet({ personality: { name, baseTone, ... } })` 覆盖。这是为以后 SDK 化留的口子。

## 13. 实施阶段

| Phase | 内容 | 验收 |
|---|---|---|
| **P1** | monorepo 重构, packages/pet/ 骨架, FSM + 漫游 + 边界, silent mode | 启动 mdzen 看到她在屏角漫游, 不调 LLM |
| **P2** | 触发器 + 概率门 + 冷却 + 气泡组件 | 选中文本 2s 后偶尔弹气泡 |
| **P3** | 拖拽 + 追鼠 + 调皮 5 种 | 拖她、follow-cursor、pounce 跑通 |
| **P4** | 聊天框 + LangChain agent + 4 个工具 + SSE 流式 | 输入问题, 流式回答, review.gif 同步 |
| **P5** | propose_edit + diff 模态 + apply-edit | 完整一条"她改我文档"流走通 |
| **P6** | 情绪系统 (affection/mood + 5 区间映射 + 持久化) | 多次无视她后变 sulky, 验证行为变化 |
| **P7** | 混合情绪 (LLM 生成 contextual + 三层吐槽混合) | 同 affection 不同上下文出不同台词 |
| **P8** | 测试补全 + example/ + README + 性能验证 | 准备发包 |

## 14. 风险 & 缓解

| 风险 | 缓解 |
|---|---|
| LangChain JS 体积大破坏 zero-dep 准则 | 仅 server 侧依赖; client bundle 用 esbuild 不打包 langchain |
| LLM 提议的 `oldText` 不匹配 | tool 内部一次校验 + apply-edit 时二次校验 + 用户可见 diff |
| 情绪系统过度玩弄 (Clippy 综合症) | 全局 30s 冷却 + 概率门 + Hiding 完全停止打扰 |
| 拖拽误触 click | 400ms 长按阈值; < 400ms 走 click 路径 |
| 多 session 并发写 chat 文件 | 单 session 一文件, 同 session 内消息串行处理 |
| 用户期间手改 md 导致 apply 冲突 | apply-edit 二次校验 + 友好提示重新征询 |
| API key 误暴露 | 仅服务端持有, 不下发浏览器 |
| GIF 资源延迟首次加载 | 服务端 cache-control: 1 day, 客户端 preload `<link rel="preload">` |

## 15. 开放问题

1. `web_search` 工具默认开还是关? — 当前: 关。需要时一行配置开。
2. `pet-state.json` 是否提供"重置我们的关系"按钮? — 建议 v2 加。
3. 是否需要 export/import 情绪状态? — 建议 v2,目前只在本机持久化。
4. 多个 mdzen 实例同时运行时 pet-state.json 写竞争? — workspaceRoot 哈希做隔离, 同 root 不会双开 (mdzen registry 已防)。
