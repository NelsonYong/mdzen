# @seren/desktop

Tauri 2 桌面壳, 把 `@seren/pet` 包装成 Codex 桌面宠物 + Claude Desktop 输入条形态的 desktop companion。

## 架构(小窗口 + setPosition 拖动)

```
┌──────────────────────────────  桌面  ──────────────────────────────┐
│                                                                    │
│                                          ┌──────────┐              │
│                                          │ 主窗口   │ ← 180×200    │
│                                          │  精灵   │   透明无边框  │
│                                          │   ★    │   alwaysOnTop │
│                                          └──────────┘              │
│                                                                    │
│  ┌─────────────────────┐                                           │
│  │ Input(浮动小窗)    │ ← 点精灵 / Cmd⇧K / 托盘 唤起,Esc 收     │
│  └─────────────────────┘                                           │
│                                                                    │
│         ┌────────────────────────────┐                             │
│         │ History(可缩放)           │ ← 输入条 📜 / 托盘菜单打开 │
│         └────────────────────────────┘                             │
└────────────────────────────────────────────────────────────────────┘
```

**为什么这个形态(踩坑 → 选择)**

我们试过两条路:

**路线 1 — 小窗口 + Tauri `startDragging()`**(原始方案)— ❌ 失败
[Tauri issue #12042](https://github.com/tauri-apps/tauri/issues/12042):macOS 上 transparent + decorations:false 时 `startDragging()` 时灵时不灵,经常拖不动。

**路线 2 — 全屏 click-through + Rust 全局鼠标监听**(koi-pond 范式)— ❌ 失败
设全屏窗口 + `set_ignore_cursor_events(true)` 默认点透,Rust 30Hz 监听鼠标位置,进精灵 bbox 时翻 OFF 让 webview 收事件。但 [Tauri issue #11461](https://github.com/tauri-apps/tauri/issues/11461) / [#13070](https://github.com/tauri-apps/tauri/issues/13070):Tauri 2 透明 webview 上 `set_ignore_cursor_events` **有 bug**,翻 OFF 后 webview 仍然收不到事件 → 精灵根本无法拖动 / 点击。

**最终路线 — 小窗口 + JS 拖动 → Rust `set_position()`** ✅
精灵窗口小,刚好包住精灵 + bubble overhead。拖动协议:JS mousedown 让 Rust 记 snapshot 当前窗口位置,后续 mousemove 上报 `screenX/Y` delta,Rust 加到 snapshot 调 `set_position()` 直接命令窗口去新位置。**完全不调 `startDragging` 也不调 `set_ignore_cursor_events`**,绕过两个已知 bug。

## 关键模块

| 模块 | 职责 |
|------|------|
| `src-tauri/src/lib.rs` | 主编排 — 三个窗口(main 启动建,input/history lazy)、tray、global shortcut、`begin_window_drag` / `drag_window_by` / `end_window_drag` 三件套命令 |
| `src-tauri/src/sidecar.rs` | spawn Node `host/server.ts`,parse 端口,优雅退出 |
| `src-tauri/src/tray.rs` | 系统托盘菜单 |
| `host/server.ts` | pet-only 极简 HTTP host,三路由 `/sprite` `/input` `/history` |
| `packages/pet/src/client/window-drag.ts` | sprite mousedown→mousemove(screenX/Y delta)→ invoke `drag_window_by`;mouseup → click vs drag(4px 阈值) |

## 启动时序

1. Rust spawn `node --experimental-strip-types packages/desktop/host/server.ts`
2. host 起 HTTP `127.0.0.1:0`,stdout 印 `📍 http://127.0.0.1:PORT`
3. Rust 抓到端口,主窗口(180×200 透明无边框)navigate 到 `/sprite`
4. JS 端 `attachSpriteFloater` 绑定 sprite.img,精灵 pin 在 webview 中心
5. 用户 mousedown sprite → invoke `begin_window_drag`(Rust 记当前窗口 outer_position)
6. mousemove → 累积 dx/dy(screenX/Y delta)→ invoke `drag_window_by(dx, dy)` → Rust `set_position(origin + delta)`
7. mouseup → invoke `end_window_drag`,如未达 4px 阈值 → invoke `toggle_input_window`
8. App 退出 SIGTERM sidecar(host trap 优雅关闭)

## 操作手册

| 动作 | 怎么做 |
|------|--------|
| 移动精灵窗口 | 长按精灵拖动 |
| 唤起输入框 | 短按精灵 / `Cmd+Shift+K` 全局 / 左键点托盘 / 托盘 → 对话框 |
| 收起输入框 | `Esc` |
| 看聊天记录 | 输入框 📜 按钮 / 托盘 → 聊天记录 |
| 让她睡觉 | 托盘 → 让她睡觉(POST `/api/pet/dream` + 隐藏精灵) |
| 退出 | 托盘 → 退出 |

## 配置 (env)

启动 `pnpm desktop:dev` 之前 export 即可, Tauri 会把 env 透传给 Node sidecar。

| 变量 | 说明 |
|------|------|
| `OPENAI_API_KEY` 或 `SEREN_API_KEY` | LLM key, 没有就走 silent mode (不能聊天) |
| `OPENAI_BASE_URL` 或 `SEREN_BASE_URL` | 兼容 OpenAI 协议的供应商 (DeepSeek / Qwen / 自部署) |
| `SEREN_MODEL` | 模型 id 覆盖 |
| `SEREN_PRESET` | `lover` / `pet` / `friend` / `sister` (默认 `lover`) |
| `SEREN_PROFILE_PATH` | 自定义 .md profile 路径 (覆盖 preset) |
| `SEREN_WORKSPACE_ROOT` | 默认 `$HOME`. 仅影响 apply-edit (桌面端不暴露) |

存储:`~/.seren/global/` 跨场景共享(emotion / memory / acquired / inner-thought 等)。OS 窗口位置由 `tauri-plugin-window-state` 持久化。

## 开发

```bash
pnpm install
OPENAI_API_KEY=sk-... pnpm desktop:dev
```

## 测试

```bash
# Rust 单元 (sidecar 端口解析 3 个)
pnpm desktop:test

# 干跑 host
node --experimental-strip-types packages/desktop/host/server.ts
# 应输出 📍 http://127.0.0.1:<port> + 三路由 200
```

## 已知限制

- **dev-only**: sidecar 跑源码 (`node --experimental-strip-types` + 相对 import)。bundled `.app` 现在跑不动。生产化要做:`pnpm --filter @seren/pet build` + 把 host/dist + pet/dist + Node 二进制作为 Tauri resource ship。
- **占位图标**: `src-tauri/icons/*.png` 是 `xilian-idle.gif` 抽帧的。
- **小窗口仍占一小块屏幕**: 现状下 click-through 不能用,精灵窗口本身会挡住窗口下方一块屏幕(180×200)。等 Tauri 修了 click-through(issue #11461 / #13070)再切回 koi-pond 范式。
- **macOS 透明窗口**: 依赖 `macos-private-api`, App Store 提交会被拒(本地 dmg 无所谓)。
- **多显示器**: 当前主窗口默认在 primary monitor 右下角。拖到副屏可以,但副屏 monitor 拔掉时 window-state 会 clamp 回主屏。multi-monitor polish = M3.8 单独迭代。
- **全局快捷键 `Cmd+Shift+K`**: 写死,跟 Raycast / Karabiner 等可能冲突 → 终端 stderr 看注册失败提示。
- **服务端 movement 决策**: agent.ts 的 movement-picker 还会发 `move-command` SSE,sprite 模式直接忽略。narration 偶尔出现"她转身跑了"的不一致 — 后续把 floatingMode 透传到 agent。

## 路线图见根目录 `TODO.md` §M3
