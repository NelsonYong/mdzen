# 阅读宠物 · Phase 2 + 3 实施计划 (Triggers / Bubbles / Mischief)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans. Steps use `- [ ]`.

**Goal:** 加上事件触发(选中/复制/闲置/仪式)+ 气泡组件 + 调皮行为(follow-cursor / pounce / scroll-chase / dodge-click / peek-on-load)。**仍然不接 LLM**,所有台词走预设池。LLM 留给 Phase 4。

**Architecture:** 前端新增 `bubble.ts`、`triggers.ts`、`mischief.ts`、`presets.ts`。事件流:DOM event → trigger 模块过概率门 + 冷却 → 决定动作(切 FSM / 弹气泡)。Bubble 是命令式 API,4 种 variant 共享一个组件。Mischief 是 Loop 的扩展,共享 rAF tick。

**Tech Stack:** 同 Phase 1。无新依赖。

**Spec reference:** §4.4 触发器表, §4.5 调皮行为, §4.8 气泡, §5.6 预设台词池(P6 才落 affection,P2-3 只播台词)。

---

## Task 1: Bubble 组件 (DOM, 4 variant)

**Files:** Create `src/client/bubble.ts`. No unit test (DOM glue).

- [ ] **Step 1**: Write `bubble.ts`:

```ts
export type BubbleVariant = 'passive' | 'protest' | 'thought' | 'chat-stub';

export interface BubbleSpec {
  text: string;
  variant: BubbleVariant;
  durationMs?: number;
}

const STYLE_BY_VARIANT: Record<BubbleVariant, Partial<CSSStyleDeclaration>> = {
  passive:    { background: '#fff',     border: '1px solid #ddd', color: '#333' },
  protest:    { background: '#ffe8e8', border: '1px solid #d05b5b', color: '#a14747' },
  thought:    { background: '#f5f5f5', border: '1px dashed #bbb',   color: '#666', fontStyle: 'italic' },
  'chat-stub':{ background: '#fff',     border: '1px solid #d06b9a', color: '#333', cursor: 'pointer' },
};

export class BubbleHost {
  private root: HTMLDivElement;
  private current: HTMLDivElement | null = null;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(parent: HTMLElement) {
    this.root = document.createElement('div');
    Object.assign(this.root.style, {
      position: 'absolute', left: '50%', top: '-8px',
      transform: 'translate(-50%, -100%)',
      pointerEvents: 'auto',
    });
    parent.appendChild(this.root);
  }

  show(spec: BubbleSpec): void {
    this.dismiss();
    const el = document.createElement('div');
    Object.assign(el.style, {
      padding: '6px 10px', borderRadius: '12px',
      fontSize: '12px', lineHeight: '1.4',
      maxWidth: '180px', whiteSpace: 'normal',
      boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
      ...STYLE_BY_VARIANT[spec.variant],
    });
    el.textContent = spec.text;
    this.root.appendChild(el);
    this.current = el;
    const dur = spec.durationMs ?? defaultDuration(spec);
    this.timer = setTimeout(() => this.dismiss(), dur);
  }

  dismiss(): void {
    if (this.timer != null) { clearTimeout(this.timer); this.timer = null; }
    if (this.current) { this.current.remove(); this.current = null; }
  }

  destroy(): void { this.dismiss(); this.root.remove(); }
}

function defaultDuration(s: BubbleSpec): number {
  if (s.variant === 'protest') return 3000;
  if (s.variant === 'thought') return 6000;
  if (s.variant === 'chat-stub') return 8000;
  // passive: scale by length
  return Math.min(8000, Math.max(4000, s.text.length * 120));
}
```

- [ ] **Step 2**: Mount in `index.ts` after sprite creation:

```ts
import { BubbleHost } from './bubble.ts';
const bubble = new BubbleHost(sprite.el);
```

- [ ] **Step 3**: typecheck + build + commit `feat(pet): bubble component with 4 variants`.

---

## Task 2: 预设台词池

**Files:** Create `src/client/presets.ts`.

- [ ] **Step 1**: Write `presets.ts`:

```ts
export const PRESET_LINES = {
  protest:  ['唔!', '放我下来啦~', '好高...', '晕...', '你又这样'],
  thought:  ['在想什么呢...', '嗯...', '唔, 有点困', '...'],
  ceremony_read_end: ['看完啦~', '下一篇也读吗?', '辛苦了'],
  ceremony_file_switch: ['这一篇', '嗯, 换一篇了', '继续吧'],
  idle_long: ['读不下去了吗?', '要我陪你吗?', '休息一下?'],
  selection: ['要解释吗?', '需要改写吗?', '总结一下?'],
  copy: ['这里有 typo 哦', '记下了吗', '嗯'],
} as const;

export type PresetCategory = keyof typeof PRESET_LINES;

export function pickPreset(category: PresetCategory, rng: () => number = Math.random): string {
  const arr = PRESET_LINES[category];
  return arr[Math.floor(rng() * arr.length)] ?? '';
}
```

- [ ] **Step 2**: Test (`presets.test.ts`):

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickPreset, PRESET_LINES } from './presets.ts';

test('preset: returns from category', () => {
  for (const k of Object.keys(PRESET_LINES) as Array<keyof typeof PRESET_LINES>) {
    const s = pickPreset(k, () => 0);
    assert.ok(PRESET_LINES[k].includes(s as never));
  }
});

test('preset: random index in range', () => {
  const v = pickPreset('protest', () => 0.99);
  assert.ok(PRESET_LINES.protest.includes(v as never));
});
```

- [ ] **Step 3**: Run tests, commit `feat(pet): preset bubble line pool`.

---

## Task 3: 概率门 + 冷却管理 (pure logic, TDD)

**Files:** `src/client/cooldown.ts` + test.

- [ ] **Step 1**: Test:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CooldownGate } from './cooldown.ts';

test('cooldown: blocks within window', () => {
  const g = new CooldownGate({ globalMs: 30_000 });
  assert.equal(g.tryFire('selection', 60_000, 0, () => 0), true);
  assert.equal(g.tryFire('selection', 60_000, 5_000, () => 0), false);
  assert.equal(g.tryFire('selection', 60_000, 70_000, () => 0), true);
});

test('cooldown: probability gate', () => {
  const g = new CooldownGate({ globalMs: 0 });
  assert.equal(g.tryFire('selection', 0, 0, () => 0.99, 0.30), false);
  assert.equal(g.tryFire('selection', 0, 0, () => 0.10, 0.30), true);
});

test('cooldown: global cooldown crosses categories', () => {
  const g = new CooldownGate({ globalMs: 30_000 });
  assert.equal(g.tryFire('a', 0, 0, () => 0), true);
  assert.equal(g.tryFire('b', 0, 5_000, () => 0), false);
});

test('cooldown: forceFire bypasses gates', () => {
  const g = new CooldownGate({ globalMs: 30_000 });
  g.tryFire('a', 0, 0, () => 0);
  g.forceFire('a', 5_000);
  assert.equal(g.tryFire('a', 0, 6_000, () => 0), false); // global still blocks
});
```

- [ ] **Step 2**: Implement:

```ts
export interface CooldownConfig { globalMs: number; }

export class CooldownGate {
  private lastByCategory = new Map<string, number>();
  private lastGlobal = -Infinity;

  constructor(private cfg: CooldownConfig) {}

  tryFire(category: string, perCategoryMs: number, now: number, rng: () => number, probability = 1): boolean {
    if (now - this.lastGlobal < this.cfg.globalMs) return false;
    const last = this.lastByCategory.get(category) ?? -Infinity;
    if (now - last < perCategoryMs) return false;
    if (rng() >= probability) return false;
    this.lastByCategory.set(category, now);
    this.lastGlobal = now;
    return true;
  }

  forceFire(category: string, now: number): void {
    this.lastByCategory.set(category, now);
    this.lastGlobal = now;
  }
}
```

- [ ] **Step 3**: Tests pass, commit `feat(pet): cooldown gate with probability and global window`.

---

## Task 4: 选中触发 (selection)

**Files:** `src/client/triggers/selection.ts` + wire in `index.ts`.

- [ ] **Step 1**: Implement `selection.ts`:

```ts
import { BubbleHost } from '../bubble.ts';
import { CooldownGate } from '../cooldown.ts';
import { pickPreset } from '../presets.ts';

const MIN_SELECTION_LEN = 20;
const DWELL_MS = 2000;
const PROBABILITY = 0.30;
const COOLDOWN_MS = 60_000;

export function attachSelection(bubble: BubbleHost, gate: CooldownGate): { destroy: () => void } {
  let dwellTimer: ReturnType<typeof setTimeout> | null = null;

  const onSelectionChange = (): void => {
    const sel = window.getSelection();
    const text = sel?.toString() ?? '';
    if (dwellTimer != null) { clearTimeout(dwellTimer); dwellTimer = null; }
    if (text.length < MIN_SELECTION_LEN) return;
    dwellTimer = setTimeout(() => {
      const now = performance.now();
      if (gate.tryFire('selection', COOLDOWN_MS, now, Math.random, PROBABILITY)) {
        bubble.show({ text: pickPreset('selection'), variant: 'chat-stub' });
      }
    }, DWELL_MS);
  };

  document.addEventListener('selectionchange', onSelectionChange);
  return {
    destroy() {
      document.removeEventListener('selectionchange', onSelectionChange);
      if (dwellTimer != null) clearTimeout(dwellTimer);
    },
  };
}
```

- [ ] **Step 2**: Wire in `index.ts` (build cooldown gate, attach).

- [ ] **Step 3**: build + commit `feat(pet): selection trigger with dwell and cooldown`.

---

## Task 5: 复制触发 (copy)

**Files:** `src/client/triggers/copy.ts`.

- [ ] **Step 1**: Implement, similar shape:

```ts
const MIN_COPY_LEN = 10;
const PROBABILITY = 0.20;
const COOLDOWN_MS = 90_000;

export function attachCopy(bubble: BubbleHost, gate: CooldownGate): { destroy: () => void } {
  const onCopy = (): void => {
    const sel = window.getSelection()?.toString() ?? '';
    if (sel.length < MIN_COPY_LEN) return;
    const now = performance.now();
    if (gate.tryFire('copy', COOLDOWN_MS, now, Math.random, PROBABILITY)) {
      bubble.show({ text: pickPreset('copy'), variant: 'passive' });
    }
  };
  document.addEventListener('copy', onCopy);
  return { destroy() { document.removeEventListener('copy', onCopy); } };
}
```

- [ ] **Step 2**: Wire + commit `feat(pet): copy trigger with cooldown`.

---

## Task 6: 闲置触发 (idle)

**Files:** `src/client/triggers/idle.ts`.

- [ ] **Step 1**: Implement:

```ts
const IDLE_THRESHOLD_MS = 5 * 60_000;
const POLL_MS = 30_000;
const TRIGGER_GUARD_MS = 60 * 60_000;

export function attachIdle(bubble: BubbleHost, gate: CooldownGate): { destroy: () => void } {
  let lastActivity = performance.now();
  let firedThisIdle = false;
  const bump = (): void => { lastActivity = performance.now(); firedThisIdle = false; };

  const events = ['mousemove', 'keydown', 'wheel', 'touchstart'];
  for (const e of events) document.addEventListener(e, bump, { passive: true });

  const interval = setInterval(() => {
    const now = performance.now();
    if (firedThisIdle) return;
    if (now - lastActivity < IDLE_THRESHOLD_MS) return;
    if (gate.tryFire('idle', TRIGGER_GUARD_MS, now, Math.random, 1.0)) {
      bubble.show({ text: pickPreset('idle_long'), variant: 'thought', durationMs: 8000 });
      firedThisIdle = true;
    }
  }, POLL_MS);

  return {
    destroy() {
      clearInterval(interval);
      for (const e of events) document.removeEventListener(e, bump);
    },
  };
}
```

- [ ] **Step 2**: Wire + commit `feat(pet): idle long-pause trigger`.

---

## Task 7: 仪式触发 (滚动末尾 + 文件切换)

**Files:** `src/client/triggers/ceremonial.ts`.

- [ ] **Step 1**: Implement:

```ts
const SCROLL_END_PROBABILITY = 0.60;
const SCROLL_END_COOLDOWN = 120_000;
const FILE_SWITCH_PROBABILITY = 0.40;
const FILE_SWITCH_COOLDOWN = 30_000;

export function attachCeremonial(bubble: BubbleHost, gate: CooldownGate, sprite: { setState: (s: 'waving') => void }): { destroy: () => void } {
  let lastPath = location.pathname;
  let firedScrollEnd = false;

  const onScroll = (): void => {
    const atBottom = window.innerHeight + window.scrollY >= document.body.scrollHeight - 20;
    if (!atBottom) { firedScrollEnd = false; return; }
    if (firedScrollEnd) return;
    firedScrollEnd = true;
    const now = performance.now();
    if (gate.tryFire('scroll-end', SCROLL_END_COOLDOWN, now, Math.random, SCROLL_END_PROBABILITY)) {
      sprite.setState('waving');
      bubble.show({ text: pickPreset('ceremony_read_end'), variant: 'passive' });
    }
  };

  const checkPath = (): void => {
    if (location.pathname === lastPath) return;
    lastPath = location.pathname;
    const now = performance.now();
    if (gate.tryFire('file-switch', FILE_SWITCH_COOLDOWN, now, Math.random, FILE_SWITCH_PROBABILITY)) {
      sprite.setState('waving');
      bubble.show({ text: pickPreset('ceremony_file_switch'), variant: 'passive' });
    }
  };

  document.addEventListener('scroll', onScroll, { passive: true });
  const interval = setInterval(checkPath, 1000);
  return {
    destroy() {
      document.removeEventListener('scroll', onScroll);
      clearInterval(interval);
    },
  };
}
```

- [ ] **Step 2**: Wire + commit `feat(pet): ceremonial triggers (scroll end, file switch)`.

---

## Task 8: 跟鼠标 (follow-cursor + pounce)

**Files:** `src/client/mischief.ts`.

- [ ] **Step 1**: Track cursor in module-level vars (passive listener), expose `attachMischief(loop, sprite)` that periodically rolls dice:

```ts
import type { Loop } from './loop.ts';
import type { Sprite } from './sprite.ts';
import { stepToward, facingFromDelta } from './motion.ts';
import { computeBound, clampPoint, type Rect } from './boundary.ts';

const FOLLOW_PROB_PER_MIN = 0.03;
const FOLLOW_DURATION_MS = 8000;
const POUNCE_STATIONARY_MS = 30_000;
const POUNCE_PROB = 0.05;
const POUNCE_COOLDOWN_MS = 3 * 60_000;
const FOLLOW_COOLDOWN_MS = 5 * 60_000;
const SPEED = 380;
const ARRIVE_R = 32;
const FACING_HYST_MS = 200;

let cursorX = 0;
let cursorY = 0;
let lastCursorMoveAt = 0;
document.addEventListener('mousemove', (e) => {
  cursorX = e.clientX; cursorY = e.clientY; lastCursorMoveAt = performance.now();
}, { passive: true });

export interface MischiefOptions {
  loop: Loop;
  sprite: Sprite;
  getViewport: () => { w: number; h: number };
  getExcluded: () => Rect[];
  padding: number;
}

export function attachMischief(opts: MischiefOptions): { destroy: () => void } {
  let lastFollowAt = -Infinity;
  let lastPounceAt = -Infinity;
  let mode: 'idle' | 'follow' | 'pounce' = 'idle';
  let modeEndsAt = 0;
  let facingPrev: 'left' | 'right' = 'right';
  let lastFacingFlipAt = 0;

  const bound = (): Rect => computeBound({
    viewport: opts.getViewport(),
    excluded: opts.getExcluded(),
    padding: opts.padding,
  });

  const tickHandle = setInterval(() => {
    const now = performance.now();
    if (mode !== 'idle') return;

    if (now - lastFollowAt > FOLLOW_COOLDOWN_MS && Math.random() < FOLLOW_PROB_PER_MIN) {
      mode = 'follow';
      modeEndsAt = now + FOLLOW_DURATION_MS;
      lastFollowAt = now;
      opts.loop.freeze();
      return;
    }

    if (now - lastPounceAt > POUNCE_COOLDOWN_MS && now - lastCursorMoveAt > POUNCE_STATIONARY_MS && Math.random() < POUNCE_PROB) {
      mode = 'pounce';
      modeEndsAt = 0;
      lastPounceAt = now;
      opts.loop.freeze();
    }
  }, 60_000);

  let last = performance.now();
  let raf = 0;
  const animate = (t: number): void => {
    const dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    if (mode !== 'idle') {
      const here = (opts.sprite as unknown as { _pos?: { x: number; y: number } });
      const cur = readPos(opts.sprite);
      const r = stepToward({ from: cur, to: { x: cursorX, y: cursorY }, speedPxPerSec: SPEED, dtSec: dt, arriveRadius: ARRIVE_R });
      const clamped = clampPoint(r.pos, bound());
      opts.sprite.setPosition(clamped.x, clamped.y);
      opts.loop.setPosition(clamped.x, clamped.y);
      writePos(opts.sprite, clamped);

      // facing
      const dx = cursorX - clamped.x;
      if (t - lastFacingFlipAt > FACING_HYST_MS) {
        const next = facingFromDelta(dx, 4, facingPrev);
        if (next !== facingPrev) { facingPrev = next; lastFacingFlipAt = t; }
      }
      opts.sprite.setState(r.arrived ? 'idle' : (facingPrev === 'left' ? 'walk-left' : 'walk-right'));

      if (mode === 'pounce' && r.arrived) {
        opts.sprite.setState('jumping');
        setTimeout(() => { exitMischief(); }, 800);
      } else if (mode === 'follow' && t >= modeEndsAt) {
        exitMischief();
      }
    }
    raf = requestAnimationFrame(animate);
  };
  raf = requestAnimationFrame(animate);

  const exitMischief = (): void => {
    mode = 'idle';
    opts.loop.unfreeze();
  };

  return {
    destroy() {
      cancelAnimationFrame(raf);
      clearInterval(tickHandle);
      if (mode !== 'idle') opts.loop.unfreeze();
    },
  };
}

function readPos(sprite: Sprite): { x: number; y: number } {
  const m = /translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/.exec(sprite.el.style.transform);
  if (!m) return { x: 0, y: 0 };
  return { x: parseFloat(m[1]!), y: parseFloat(m[2]!) };
}

function writePos(_sprite: Sprite, _p: { x: number; y: number }): void {
  // setPosition already wrote it via opts.sprite.setPosition; no-op.
}
```

- [ ] **Step 2**: Wire in `index.ts`. Commit `feat(pet): mischief - follow-cursor and pounce`.

---

## Task 9: Peek-on-load + dodge-click + scroll-chase (light)

**Files:** Extend `mischief.ts` or new `mischief-light.ts`.

For Phase 2-3 simplicity, **only implement `peek-on-load`** (one-time per page) and `dodge-click` (低优,简单). `scroll-chase` 推到 Phase 8 polish.

- [ ] **Step 1**: peek-on-load: at mount, start sprite below viewport, walkTo to bottom-right corner over 600ms.

- [ ] **Step 2**: dodge-click: 15% chance, when user clicks the sprite, randomize a small lateral hop before responding.

- [ ] **Step 3**: Commit `feat(pet): peek-on-load and dodge-click mischief`.

---

## Task 10: 一致性 + 验收

- [ ] **Step 1**: full pipeline: typecheck + tests + build + smoke.
- [ ] **Step 2**: manual browser check: 选中文本 ≥ 20 字停 2s,看气泡概率出现;复制后偶尔评论;长时间不动后被问"读不下去了吗";页面加载有探头;长按拖她;鼠标静止 30s 后偶尔被扑。
- [ ] **Step 3**: Commit `chore(pet): phase 2-3 verified` (no code, just trigger CI re-run if needed).

---

## Acceptance

- [ ] Bubble 4 variants render correctly
- [ ] cooldown.test.ts proves probability + cooldown + global lock
- [ ] presets.test.ts proves preset categories
- [ ] All P1 tests still green (零 regression)
- [ ] Manual smoke: 选中 / 复制 / 闲置 / 滚动末尾 / 切换文件 / follow-cursor / pounce / peek-on-load / dodge-click / drag 都可触发
