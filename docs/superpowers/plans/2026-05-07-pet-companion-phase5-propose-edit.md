# 阅读宠物 · Phase 5 (propose_edit + diff modal + apply-edit)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans.

**Goal:** 让她**提议**修改 md 文件 — LLM 调 `propose_edit` 工具,服务端不写盘只推 SSE,前端弹 diff 模态,用户点"应用"才落盘。`apply-edit` 端点二次校验防止文件期间被改。

**Architecture:** Server: 新增 `proposals.ts`(内存 proposalId map, 10 分钟 TTL),`propose_edit` tool 加进 `tools.ts`,handler 加 `apply-edit` 路由。Client: `diff-modal.ts` 渲染左原文/右新文 + reason + 应用/拒绝按钮;chat SSE 消费 `propose-edit` / `edit-applied` 事件。

**Spec reference:** §6.2 propose_edit 流, §7.4 安全闸。

---

## Task 1: Proposals registry (TDD)

**Files:** `src/server/proposals.ts` + test.

- [ ] **Step 1**: Test:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProposalRegistry } from './proposals.ts';

test('proposals: store + retrieve', () => {
  const r = new ProposalRegistry({ ttlMs: 60_000 });
  const id = r.create({ sessionId: 's1', path: 'a.md', oldText: 'a', newText: 'b', reason: 'fix' }, 0);
  const p = r.get(id, 100);
  assert.equal(p?.path, 'a.md');
});

test('proposals: expired returns null', () => {
  const r = new ProposalRegistry({ ttlMs: 1000 });
  const id = r.create({ sessionId: 's1', path: 'a.md', oldText: 'a', newText: 'b', reason: 'fix' }, 0);
  assert.equal(r.get(id, 2000), null);
});

test('proposals: consume removes', () => {
  const r = new ProposalRegistry({ ttlMs: 60_000 });
  const id = r.create({ sessionId: 's1', path: 'a.md', oldText: 'a', newText: 'b', reason: 'fix' }, 0);
  assert.ok(r.consume(id, 100));
  assert.equal(r.get(id, 200), null);
});
```

- [ ] **Step 2**: Implement:

```ts
import { randomUUID } from 'node:crypto';

export interface Proposal {
  sessionId: string;
  path: string;
  oldText: string;
  newText: string;
  reason: string;
  createdAt: number;
}

export interface ProposalInput {
  sessionId: string;
  path: string;
  oldText: string;
  newText: string;
  reason: string;
}

export interface ProposalRegistryConfig {
  ttlMs: number;
}

export class ProposalRegistry {
  private map = new Map<string, Proposal>();
  private ttlMs: number;

  constructor(cfg: ProposalRegistryConfig) {
    this.ttlMs = cfg.ttlMs;
  }

  create(input: ProposalInput, now: number): string {
    const id = randomUUID();
    this.map.set(id, { ...input, createdAt: now });
    return id;
  }

  get(id: string, now: number): Proposal | null {
    const p = this.map.get(id);
    if (!p) return null;
    if (now - p.createdAt > this.ttlMs) {
      this.map.delete(id);
      return null;
    }
    return p;
  }

  consume(id: string, now: number): Proposal | null {
    const p = this.get(id, now);
    if (p) this.map.delete(id);
    return p;
  }
}
```

- [ ] **Step 3**: Tests pass, commit `feat(pet): proposal registry with TTL`.

---

## Task 2: propose_edit tool wired in

**Files:** `src/server/tools.ts` (extend).

- [ ] **Step 1**: Extend `buildTools` signature: accept `(workspaceRoot, ctx)` where `ctx` provides `proposeEdit(input): Promise<string>` (the side effect lives outside tools.ts so storage/sse stay separate).

```ts
export interface ToolContext {
  proposeEdit(input: { path: string; oldText: string; newText: string; reason: string }): Promise<string>;
}

export function buildTools(workspaceRoot: string, ctx?: ToolContext) {
  // ... existing list_files, read_file, search ...

  const tools: Array<ReturnType<typeof tool>> = [listFiles, readFileTool, searchTool];

  if (ctx) {
    const proposeEdit = tool(
      async (input: { path: string; oldText: string; newText: string; reason: string }) => {
        return ctx.proposeEdit(input);
      },
      {
        name: 'propose_edit',
        description: '提议修改一个 md 文件中的一段文字。oldText 必须是原文逐字, newText 是替换段, reason 一句话解释。提议会显示给用户审阅, 不会立即写盘。',
        schema: z.object({
          path: z.string(),
          oldText: z.string(),
          newText: z.string(),
          reason: z.string(),
        }),
      },
    );
    tools.push(proposeEdit);
  }
  return tools;
}
```

- [ ] **Step 2**: Update agent.ts to pass ctx with sessionId binding (use closure / per-run context).

- [ ] **Step 3**: Commit `feat(pet): propose_edit tool definition`.

---

## Task 3: propose_edit side-effect (validate + emit SSE)

**Files:** `src/server/agent.ts` (or new `src/server/propose.ts`).

- [ ] **Step 1**: Implement `proposeEdit(workspaceRoot, registry, sessionId, input)`:
  1. safeResolve path under workspaceRoot, .md only
  2. read file, verify oldText is verbatim substring (and unique enough — first occurrence)
  3. registry.create() → proposalId
  4. dispatch `{type:'propose-edit', sessionId, proposalId, path, oldText, newText, reason}`
  5. return string `"提议已发送给用户, 等候应用或拒绝(proposalId=<id>)"`

- [ ] **Step 2**: Extend SSE event type union with `propose-edit` and `edit-applied`.

- [ ] **Step 3**: Wire `proposeEdit` into `createPetAgent(deps, registry)` and pass to buildTools per session.

- [ ] **Step 4**: Commit `feat(pet): propose_edit side effect with double validation`.

---

## Task 4: apply-edit endpoint

**Files:** `src/server/handler.ts`.

- [ ] **Step 1**: New POST route `/api/pet/apply-edit`. Body: `{ proposalId }`. Logic:
  1. registry.consume(id) — None → 404
  2. Re-read file, verify oldText is **still verbatim substring**. If not → 422 + JSON `{error:'文件已被改动'}`.
  3. Replace first occurrence of oldText with newText, atomic write (temp + rename).
  4. dispatch `{type:'edit-applied', sessionId, proposalId, path}`.
  5. Return 200 `{ok:true}`.

- [ ] **Step 2**: matches() recognize new path.

- [ ] **Step 3**: Commit `feat(pet): apply-edit endpoint with race-condition guard`.

---

## Task 5: Client diff modal

**Files:** `src/client/diff-modal.ts`.

- [ ] **Step 1**: Implement a simple modal with two pre-formatted boxes(old / new), reason header, 应用 / 拒绝 buttons. On 应用: `POST /api/pet/apply-edit`. On 拒绝: just close.

```ts
export interface DiffModalOptions {
  proposalId: string;
  path: string;
  oldText: string;
  newText: string;
  reason: string;
  onClose?: () => void;
}

export function showDiffModal(opts: DiffModalOptions): void {
  const overlay = document.createElement('div');
  Object.assign(overlay.style, {
    position: 'fixed', inset: '0', background: 'rgba(0,0,0,0.4)',
    zIndex: '20000', display: 'flex', alignItems: 'center', justifyContent: 'center',
  });
  const card = document.createElement('div');
  Object.assign(card.style, {
    background: '#fff', borderRadius: '12px', width: '720px', maxWidth: '90vw',
    maxHeight: '85vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
    boxShadow: '0 16px 48px rgba(0,0,0,0.18)', fontFamily: 'system-ui, sans-serif',
  });

  const header = document.createElement('div');
  Object.assign(header.style, { padding: '16px 20px', borderBottom: '1px solid #eee' });
  header.innerHTML = `<div style="font-size:13px;color:#666;margin-bottom:4px;">${esc(opts.path)}</div><div style="font-size:14px;">${esc(opts.reason)}</div>`;

  const body = document.createElement('div');
  Object.assign(body.style, { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', padding: '16px', flex: '1', overflow: 'auto' });
  const oldBox = makeBox('原文', opts.oldText, '#fff5f5');
  const newBox = makeBox('新文', opts.newText, '#f0fff4');
  body.appendChild(oldBox);
  body.appendChild(newBox);

  const footer = document.createElement('div');
  Object.assign(footer.style, { padding: '12px 20px', borderTop: '1px solid #eee', display: 'flex', gap: '8px', justifyContent: 'flex-end' });
  const reject = makeBtn('拒绝', '#fff', '#ddd');
  const apply = makeBtn('应用', '#fde7f3', '#d06b9a');
  footer.appendChild(reject);
  footer.appendChild(apply);

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(footer);
  overlay.appendChild(card);
  document.body.appendChild(overlay);

  const close = (): void => { overlay.remove(); opts.onClose?.(); };
  reject.addEventListener('click', close);
  apply.addEventListener('click', async () => {
    apply.textContent = '应用中...';
    apply.disabled = true;
    try {
      const r = await fetch('/api/pet/apply-edit', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ proposalId: opts.proposalId }),
      });
      if (!r.ok) {
        const data = await r.json().catch(() => ({}));
        alert(`应用失败: ${data.error ?? r.status}`);
        apply.textContent = '应用';
        apply.disabled = false;
        return;
      }
      close();
    } catch {
      apply.textContent = '应用';
      apply.disabled = false;
    }
  });
}

function makeBox(label: string, text: string, bg: string): HTMLDivElement {
  const wrap = document.createElement('div');
  Object.assign(wrap.style, { display: 'flex', flexDirection: 'column', gap: '6px' });
  const lbl = document.createElement('div');
  lbl.textContent = label;
  Object.assign(lbl.style, { fontSize: '11px', color: '#888', textTransform: 'uppercase' });
  const pre = document.createElement('pre');
  pre.textContent = text;
  Object.assign(pre.style, {
    background: bg, padding: '12px', borderRadius: '6px', fontSize: '12px',
    fontFamily: 'ui-monospace, Menlo, monospace', whiteSpace: 'pre-wrap',
    wordWrap: 'break-word', margin: '0', flex: '1', overflow: 'auto',
  });
  wrap.appendChild(lbl);
  wrap.appendChild(pre);
  return wrap;
}

function makeBtn(text: string, bg: string, border: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  Object.assign(b.style, {
    padding: '8px 16px', borderRadius: '6px', border: `1px solid ${border}`,
    background: bg, cursor: 'pointer', fontSize: '13px',
  });
  return b;
}

function esc(s: string): string {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] ?? c));
}
```

- [ ] **Step 2**: Wire in `chat.ts`: on SSE `propose-edit` event, call `showDiffModal`. On `edit-applied`, append a system message "已应用". Update agent system prompt to mention propose_edit ability.

- [ ] **Step 3**: Commit `feat(pet): diff preview modal + propose-edit / edit-applied event handling`.

---

## Task 6: Verify

- [ ] **Step 1**: Pipeline green.
- [ ] **Step 2**: With API key + a test md file: ask "把这段第 X 行改成 …", expect diff modal.
- [ ] **Step 3**: Concurrent edit: edit file in IDE between propose and apply → expect 422.
- [ ] **Step 4**: Commit verify if needed.
