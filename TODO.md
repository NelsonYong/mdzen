# Seren — TODO

> 长期跟踪文件。`[ ]` → `[x]` 标完成 + 日期。三份评估见 §3 §4 §6。
> Last reviewed: 2026-05-07(架构 + 文档 + 代码质量,3 份并行评估均完毕)
> **M1 完整 PASS (2026-05-07): 191/191 pet + 57/57 mdzen 测试绿;架构债清理 + 全套文档 + 测试覆盖补齐。**

---

## §1 Roadmap(按推荐顺序)

### M1 — 还债 + 文档 ✅ 2026-05-07 全部完成

**M1.0 Quick wins**
- [x] 2026-05-07 `shared/strip-think.ts`(8 处复制收拢)
- [x] 2026-05-07 `agent.ts` 顶部注释 system prompt 装配顺序
- [x] 2026-05-07 改进 `personality?` deprecated 注释(后被 M1.2b 整体删除)
- [x] 2026-05-07 handler.ts 错误信息 `@mdzen/pet` → `@seren/pet`
- [x] 2026-05-07 `pets/lover.md` / `pet.md` / `friend.md` / `sister.md` 内置预设外置
- [x] 2026-05-07 `memory.ts` episodes append-only 注释
- [x] 2026-05-07 `storage.ts` chat history 注释
- [x] 2026-05-07 `emotion-storage.ts` per-field validation(避免 NaN 下游)
- [x] 2026-05-07 README cooldown 表(并入 ARCHITECTURE.md)

**M1.1 高 ROI 重构**
- [x] 2026-05-07 `agent.run()` 拆 → `assembleSystemPrompt()` + `dispatchPostReplyJobs()` + 11 个 snapshot 测试
- [x] 2026-05-07 `createJsonStore<T>` 抽象(6 store 收拢,~250 LOC 净删)
- [x] 2026-05-07 `runJsonExtractor<T>` + `runTextExtractor` 抽象(7 LLM 调用点收拢)

**M1.2 单例治理**
- [x] 2026-05-07 `proactive.ts` 模块级单例 → `createProactiveLoop` 工厂
- [x] 2026-05-07 `sse.ts` channels map → `createSseChannels` 工厂(`agent.ts` 接收 `dispatch` 作为 dep)
- [x] 2026-05-07 `PersonalityConfig` 完全删除,3 个 caller(memory-updater / proactive / contextual)统一吃 `PetProfile`

**M1.3 文档** ✅
- [x] 2026-05-07 `packages/pet/ARCHITECTURE.md`(5 时间尺度 / SOUL+layers / system prompt 装配 / global vs workspace / cooldown 梯队)
- [x] 2026-05-07 `packages/pet/PROFILE.md` + `pets/*.md` 4 个示例
- [x] 2026-05-07 重写 `packages/pet/README.md`
- [x] 2026-05-07 更新根 `CLAUDE.md` 加 pet 章节
- [x] 2026-05-07 `packages/pet/CONCEPTS.md` glossary
- [x] 2026-05-07 重写 `packages/pet/example/README.md`

**M1.4 测试 + log** ✅
- [x] 2026-05-07 HTTP handler routing 14 个新测试(/chat /event /signal /history GET+DELETE /memory /dream /apply-edit + 404)
- [x] 2026-05-07 `migrate.ts` 6 个测试(idempotency / 选最新 ws / pet-state→emotion 重命名 / 部分文件丢失容错)
- [x] 2026-05-07 silent catch breadcrumbs(agent.ts × 4 + acquired/memory/inner-thought/proactive)
- [x] 2026-05-07 `assembleSystemPrompt` 11 个 snapshot 测试(SOUL 顺序 / re-injection 8-轮 / acquired 阈值过滤等)

### M2 — 增量产品(2026-05-08 完成,**全部不耦合具体场景**)
- [x] 2026-05-08 **关系里程碑** — `daysKnown` + `sessionsCount` + 7/30/100/365 milestone notes
- [x] 2026-05-08 **新会话边界效果** — `isReturningAfterGap`(≥4h)注入"重逢"色彩
- [x] 2026-05-08 **proactive 基于 episodes** — 最近 3 条 episodes 进 askShouldSpeak,LLM 可 callback
- [x] 2026-05-08 **Day-mood baseline** — 24h 慢背景,与 inner-thought / rhythm / zone 并列,首次 dawn/morning 调用 LLM 生成
- [x] 2026-05-08 **history-modal acquired + 梦 tab** — 2 个新端点 + 客户端 tab 切换
- ~~scrollPosition + 当前小节标题~~ — **跳过**(场景耦合)
- ~~selection 注入 chat prompt~~ — **跳过**(场景耦合,等 Tauri 时再做 OS 级)

### M3 — Tauri 桌面化(3-4 周)
- [ ] 透明无边框窗口,可拖、可点透
- [ ] 系统托盘 + 右键菜单(显示 / 睡觉 / 设置)
- [ ] sidecar localhost(server 包跑在 Tauri 里)
- [ ] 存储路径不变(`~/.seren/global/...`)
- [ ] 跨重启状态恢复("昨晚睡了"延续到今天)
- [ ] 多显示器
- [ ] 电量管理 / 专注模式不打扰
- [ ] **依赖 §3 中的 PetAPI / PetTransport 抽象**(必须先做,否则 HTTP-route 解耦痛苦)

### M4 — TTS(Tauri 之后)
- [ ] 方案讨论(用户已说要听:ElevenLabs vs 国产 vs 端侧;台本化;流式分句;中断处理)
- [ ] 实施

### M5 — 后期(暂搁)
- [ ] 屏幕权限(用户主动给的"分享给希莲"快捷键)
- [ ] 多模态(看截图)
- [ ] 本地模型回落(Ollama)
- [ ] 多 profile 并存(取决于 §3 单例修干净)
- [ ] 变现模型决策

---

## §2 已完成

### 2026-05-07 — M1 还债批次
- ✅ 全套抽象层:`createJsonStore<T>` / `runJsonExtractor<T>` / `runTextExtractor`
- ✅ `agent.run()` 拆为 `assembleSystemPrompt` + `dispatchPostReplyJobs`(可独立测试)
- ✅ 模块级单例死光:`createSseChannels` + `createProactiveLoop` 工厂
- ✅ `PersonalityConfig` 完全清除
- ✅ `stripThinkBlocks` 8 复制 → 1 共享工具
- ✅ Pet 文档套件:ARCHITECTURE / PROFILE / CONCEPTS / 重写 README + example/README
- ✅ Profile 预设外置为 `pets/*.md`
- ✅ 测试覆盖 159 → **191**;新增 migrate(6)+ handler routes(14)+ assembleSystemPrompt(11)
- ✅ silent catch breadcrumbs

### 2026-05-07 之前

- ✅ 项目改名 `seren`(角色仍 希莲)
- ✅ Profile 系统(frontmatter md + 4 preset:lover/pet/friend/sister)
- ✅ 动作系统(core 锁定 + extension 注册 + LLM action picker)
- ✅ Rhythm(7 时段 / baseMood / dialogueTendency / innerThought)
- ✅ Episodes 情景记忆(append-only,在 memory 里跟 facts 并列)
- ✅ Acquired 演化层(habit / preference / relation_belief × confidence × 4-op)
- ✅ Dynamic inner_thought(每小时刷新,见 episodes)
- ✅ Presence / lastSeenAt 跨重启
- ✅ Global memory(脱离 workspace 隔离)
- ✅ Dream consolidation(Stanford reflection + Claude Code Auto Dream 4 阶段)

---

## §3 架构债务(架构 review,2026-05-07)

### 必修(影响后续每件事)
- [ ] **`agent.ts` 拆 PromptBuilder + PostReplyJobs**
  当前 god-orchestrator:8 段条件 string 拼接 system prompt + 7 个 fire-and-forget fanout。新功能(TTS/视觉/日历)会持续往 `run()` 里堆。
  - PromptBuilder:确定性顺序、可单测、注释化"soul-first 不可变"
  - PostReplyJobs:fanout + 共享取消 + 可观测
- [ ] **`proactive.ts` 模块级单例 → factory**
  `lastSpokenAt` / `activeSignals` / `timer` 都是 module-level,**多 profile 直接死,测试会泄漏状态,Tauri sidecar 进程嵌入会冲撞**
- [ ] **`sse.ts` `channels` map → instance**
  同上理由。
- [ ] **抽 `createJsonStore<T>({ dir, file, validate, empty })`**
  6 个 store 文件复制了同样的 `mkdir + tmp-write + rename` + `JSON.parse + try/catch` 形状。每加一个 state 维度就 +80 LOC 死复制。

### 应修(Tauri 之前一定动)
- [ ] **`currentDoc` / `workspaceRoot` / `.md` 三件套 → 抽象**
  - 重命名 `currentDoc: string` → `currentContext: { kind: 'doc'|'app'|'window', label: string }`
  - `tools.ts` 里 3 处 `extname() !== '.md'` + `agent.ts:166` 的冗余 `.md` 校验 → 注入 `ContentPolicy`
  - `proactive.ts:182` 系统提示里 `"住在 markdown 阅读器里"` 字符串 → profile.relationship-aware 模板
- [ ] **`migrate.ts` 静默数据丢失风险**
  当前选 mtime 最新的 workspace,旧的情绪状态直接丢,无日志。
  - per-file idempotency
  - 多 workspace 时合并而非选最新
  - 至少 stderr log 一行
- [ ] **`PetTransport` + `PetAPI` 抽象**
  现在 5 个 inline handler 直接吞 `IncomingMessage` / `ServerResponse`(handler.ts:353/492/519)。**Tauri 时这层映射会很痛苦**。先定 `interface PetAPI { chat, history, applyEdit, state, event, signal, memory, dream, sse }`,handler.ts 适配 HTTP,Tauri command 适配 invoke。

### 可推迟
- [ ] `proactive.ts` 的 dream-or-speak 拆 Scheduler + 任务注册
- [ ] `handler.ts` 拆(目前 ~580 LOC)
- [ ] `RuntimeState` 14 字段 → group(`stores`, `agent`, `transport`)

---

## §4 文档债务(文档 review,2026-05-07)

### 必写
- [ ] **`packages/pet/ARCHITECTURE.md`** — 5 时间尺度记忆 / soul-base+acquired+memory+episodes+dream 关系 / system prompt 装配顺序 / global vs workspace / 4 个 LLM cooldown 梯队
- [ ] **`packages/pet/PROFILE.md` + 示例 `pets/lover.md` / `pets/pet.md`** — frontmatter 字段表 + JSON 备选 + precedence 表(从 `profile-presets.ts:17-44` 直接 lift 出来当示例)
- [ ] **重写 `packages/pet/README.md`** — 当前是 Phase 1 旧叙述,**70% 服务端子系统都没提**;路由表少 `/event /signal /memory /dream`;还引用已删除的 `client/chat.ts`
- [ ] **更新根 `CLAUDE.md`** — 加 pet 章节,指 ARCHITECTURE.md;说明 pet 有自己的 commands/tests

### 应写
- [ ] `packages/pet/CONCEPTS.md` 或 ARCHITECTURE.md 内 glossary —— Profile vs Personality vs userProfile / Episode / acquired vs trait / inner-thought vs contextual vs zone
- [ ] 重写 `example/README.md`(当前 6 行,且内容错的)
- [ ] `CreatePetOptions` JSDoc 加 precedence 表(soul > profilePath > soulPath > preset > defaults)

### Quick wins(< 1h 每个)
- [ ] **`agent.ts` 顶部注释 enumerate system prompt 装配顺序**(SOUL → behavior → lastSeen → rhythm/innerThought → acquired → zone → contextual → currentDoc → userProfile → facts → episodes → reinject@8turns)
- [ ] **README 加 10 行 cooldown 表**:subsystem | 文件 | 冷却 | 触发门
- [ ] **删除 / 修复 `personality?` 误导性 `@deprecated` 注释**(指向不存在的 `profile` 字段)
- [ ] **`memory.ts:19` 一行说明 episodes 为何 append-only**
- [ ] **`pets/lover.md` / `pets/pet.md`** 把 preset 提取成示例文件
- [ ] **handler.ts:343 错误信息里的 `@mdzen/pet` → `@seren/pet`**
- [ ] **`storage.ts:16` 加注释**:这是 chat history,不是 memory store

---

## §5 命名 / 字符串清理

- [ ] handler.ts:343 用户可见错误里 `@mdzen/pet` 改 `@seren/pet`
- [ ] `PersonalityConfig` 全部删除(已被 `PetProfile` 替代,handler.ts:268-274 的 shim 也可以拆掉)
- [ ] CSS 类前缀 `mdzen-pet-*`(~80 处,client/history-modal.ts 集中)— 是否要全替成 `seren-*`?
- [ ] 三件名字消歧文档:`@seren/pet`(npm)/ `__SEREN_CONFIG__`(runtime)/ `~/.seren`(storage)/ `mdzen`(host)/ `希莲 / Xilian`(character)

---

## §6 代码质量(2026-05-07 评估完)

### 必修(已并入 M1.x)
- [ ] **`stripThinkBlocks` × 8 处复制** → `src/shared/strip-think.ts`(M1.0)
- [ ] **`agent.run()` 290 行,15 件事**(prompt 装配 + 流式 + 6 个后台 fanout)→ 拆 `assembleSystemPrompt` + `dispatchBackgroundUpdates`(M1.1)
- [ ] **`emotion-storage.ts:25` 无 runtime validation** — 直接 `JSON.parse(buf) as EmotionState`,坏文件 → NaN affection 下游传染(M1.0)
- [ ] **6 处 LLM extractor 模式重复** → `runJsonExtractor<T>(deps, opts)`(M1.1,净删 ~150 LOC)
- [ ] **HTTP handler 测试覆盖 < 20%** — `/chat /event /signal /memory /dream /apply-edit /history` 全无单测(M1.4)
- [ ] **5 处 silent catch 藏 bug**(M1.4)

### 应修
- [ ] **`PersonalityConfig` vestigial** — 3 个 caller(memory-updater / proactive / contextual)各自从 `PetProfile` 重新合成 5 字段字面量,handler 里同一段 shim 重复两次(`agent.ts:268-274` 和 `:348-354`)。直接换成 `PetProfile`(M1.2)
- [ ] **`RuntimeState.agent` 字段冗余** — `cachedAgent` closure 已处理 lazy,字段是 dead weight
- [ ] **SSE event 端到端类型化** — 服务端 `PetEvent` 已经有 union,客户端 `sse-consumer.ts` 仍 `any`-parse,服务端字段名 typo 只能运行时炸
- [ ] **散落的魔数集中**:
  - `acquired.ts:210` 0.4/0.7 标签阈值 inline,与 `PROMPT_INCLUDE_THRESHOLD` 同值不同地方,漂移风险
  - `contextual.ts:81-86` 80/50/25/10 应该挪进 `emotion.ts` 与 `affectionZone()` 同居
  - `inner-thought.ts:117` 12h 梦新鲜度窗口 → `DREAM_FRESHNESS_MS`
- [ ] **dream `0.7` vs extractor `0.5` 初始 confidence**:刻意不同(梦看模式,extractor 看一片) — 加一行注释说明 rationale

### 可推迟 / 留意但不动
- 4-op applier 三处(memory / acquired / dream)虽然形状相似,语义不同(target / 不变量 / per-category cap)— 通用化反而膨胀,**保持分离**(评估明确建议)
- `handler.ts` 583 LOC 大但每个 handler 短自包含,**不拆**(评估建议保留)

### 测试覆盖空白(已并入 M1.4)
排序:
1. `assembleSystemPrompt`(待提取):**最大空白**,人格漂移 bug 都藏这里
2. HTTP handler routing
3. `migrate.ts`:0 测试,可能静默丢 v1 用户数据
4. `runDream` 端到端(stub LLM)
5. proactive tick dream-vs-speak 分支

---

## §7 工作流约定

- 这个文件是**单一 source of truth**,改动直接更新这里
- 完成项 `[ ]` → `[x]` + 日期(`[x] 2026-05-08 ...`)
- 完成 N 周以上的项搬到 §2(已完成)
- 跨周不动的项加 🟡 标记;反复推迟的加 ⚠️
