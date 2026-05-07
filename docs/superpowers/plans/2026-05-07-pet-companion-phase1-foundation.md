# 阅读宠物 · Phase 1 Foundation 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap pnpm monorepo, scaffold `@mdzen/pet` package, ship a silent (no-LLM) pet that lives in mdzen preview pages with autonomous 9-state FSM, boundary clamping, smooth movement.

**Architecture:** Convert root to pnpm workspaces with mdzen at root and `packages/pet/` alongside. Pet package exports `createPet()` which returns `{ matches, handle, scriptTag, close }`. mdzen adapter (`src/pet-adapter.ts`) instantiates pet and dispatches in `server.ts`. Pure-logic modules (FSM, boundary, motion math) are unit-tested via `node:test`; DOM layer is verified by manual smoke. Client bundled by esbuild at `pnpm build:client` time, served from `packages/pet/dist/client.js`.

**Tech Stack:** Node 22+ with `--experimental-strip-types`, pnpm workspaces, TypeScript 5.9, esbuild (devDep of pet package), `node:test` + `node:assert` (no other test deps).

**Out of scope (later phases):** triggers / probability gates (P2), drag / follow-cursor / mischief (P3), LangChain agent (P4), propose_edit + diff modal (P5), affection / mood / persistence (P6), LLM-generated contextual emotion (P7), polish (P8). Phase 1 ships **only the silent pet** so we can sanity-check the foundation before adding LLM.

**Spec reference:** `docs/superpowers/specs/2026-05-07-pet-companion-design.md` §3 (架构), §4.1-4.3 (FSM, 漫游, 边界), §4.6 (运动学), §11 (性能预算).

---

## Task 1: Bootstrap pnpm workspaces + pet package skeleton

**Files:**
- Create: `pnpm-workspace.yaml`
- Create: `packages/pet/package.json`
- Create: `packages/pet/tsconfig.json`
- Create: `packages/pet/src/index.ts`
- Modify: `package.json` (add workspace dep)

- [ ] **Step 1: Create `pnpm-workspace.yaml`**

```yaml
packages:
  - 'packages/*'
```

- [ ] **Step 2: Create `packages/pet/package.json`**

```json
{
  "name": "@mdzen/pet",
  "version": "0.0.1",
  "description": "Reading companion pet for markdown viewers",
  "type": "module",
  "main": "src/index.ts",
  "exports": {
    ".": {
      "types": "./src/index.ts",
      "import": "./src/index.ts"
    }
  },
  "files": [
    "src",
    "dist"
  ],
  "scripts": {
    "typecheck": "tsc --noEmit",
    "test": "node --experimental-strip-types --test 'src/**/*.test.ts'",
    "build:client": "node --experimental-strip-types scripts/build-client.ts"
  },
  "engines": {
    "node": ">=22.6.0"
  },
  "devDependencies": {
    "esbuild": "^0.24.0",
    "@types/node": "^22.0.0",
    "typescript": "^5.9.3"
  }
}
```

- [ ] **Step 3: Create `packages/pet/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "./src",
    "noEmit": true
  },
  "include": ["src/**/*", "scripts/**/*"]
}
```

- [ ] **Step 4: Create `packages/pet/src/index.ts` (skeleton)**

```ts
export type { CreatePetOptions, Pet } from './shared/types.ts';

export function createPet(opts: import('./shared/types.ts').CreatePetOptions): import('./shared/types.ts').Pet {
  throw new Error('not implemented yet');
}
```

- [ ] **Step 5: Add workspace dep to root `package.json`**

In `dependencies` add (using Edit tool, do not rewrite the file):

```json
"@mdzen/pet": "workspace:*"
```

- [ ] **Step 6: Install**

Run: `pnpm install`
Expected: succeeds, `node_modules/@mdzen/pet` is a symlink to `packages/pet`.

- [ ] **Step 7: Verify mdzen still works**

Run: `pnpm typecheck && pnpm test`
Expected: all green (we haven't touched mdzen logic).

- [ ] **Step 8: Commit**

```bash
git add pnpm-workspace.yaml packages/pet/package.json packages/pet/tsconfig.json packages/pet/src/index.ts package.json pnpm-lock.yaml
git commit -m "chore(monorepo): set up pnpm workspaces with empty pet package"
```

---

## Task 2: Move GIF assets into pet package

**Files:**
- Move: `pets/xilian-gifs/*.gif` → `packages/pet/src/assets/*.gif`
- Delete: `pets/` (empty afterward)

- [ ] **Step 1: Create assets dir and move GIFs**

```bash
mkdir -p packages/pet/src/assets
git mv pets/xilian-gifs/*.gif packages/pet/src/assets/
```

- [ ] **Step 2: Verify all 9 GIFs moved**

Run: `ls packages/pet/src/assets/ | sort`
Expected output (9 files):
```
xilian-failed.gif
xilian-idle.gif
xilian-jumping.gif
xilian-review.gif
xilian-running-left.gif
xilian-running-right.gif
xilian-running.gif
xilian-waiting.gif
xilian-waving.gif
```

- [ ] **Step 3: Remove old empty dir**

```bash
rmdir pets/xilian-gifs pets 2>/dev/null || true
```

- [ ] **Step 4: Commit**

```bash
git add packages/pet/src/assets pets
git commit -m "chore(pet): move xilian gif assets into package"
```

---

## Task 3: Define shared types

**Files:**
- Create: `packages/pet/src/shared/types.ts`

- [ ] **Step 1: Write the file**

```ts
import type { IncomingMessage, ServerResponse } from 'node:http';

export type FsmState =
  | 'idle'
  | 'walk-left'
  | 'walk-right'
  | 'running'
  | 'jumping'
  | 'waiting'
  | 'wandering'
  | 'review'
  | 'waving'
  | 'failed';

export interface Boundary {
  selector?: string;
  rect?: { x: number; y: number; w: number; h: number };
  padding?: number;
  exclude?: string[];
}

export interface PersonalityConfig {
  name: string;
  pronoun: string;
  baseTone: 'gentle-girlish' | 'cool-cat' | string;
  emojiPolicy: 'none' | 'sparing' | 'liberal';
  responseLength: 'short' | 'medium';
}

export interface CreatePetOptions {
  workspaceRoot: string;
  llm?: {
    baseURL?: string;
    apiKey?: string;
    model?: string;
  };
  storage?: { chatDir?: string };
  personality?: Partial<PersonalityConfig>;
  routePrefix?: string;
  boundary?: Boundary;
}

export interface Pet {
  matches(req: IncomingMessage): boolean;
  handle(req: IncomingMessage, res: ServerResponse): Promise<void>;
  scriptTag(): string;
  close(): Promise<void>;
}

export const ALL_GIFS: ReadonlyArray<string> = [
  'xilian-failed.gif',
  'xilian-idle.gif',
  'xilian-jumping.gif',
  'xilian-review.gif',
  'xilian-running-left.gif',
  'xilian-running-right.gif',
  'xilian-running.gif',
  'xilian-waiting.gif',
  'xilian-waving.gif',
];

export const STATE_TO_GIF: Readonly<Record<FsmState, string>> = {
  'idle': 'xilian-idle.gif',
  'walk-left': 'xilian-running-left.gif',
  'walk-right': 'xilian-running-right.gif',
  'running': 'xilian-running.gif',
  'jumping': 'xilian-jumping.gif',
  'waiting': 'xilian-waiting.gif',
  'wandering': 'xilian-running.gif',
  'review': 'xilian-review.gif',
  'waving': 'xilian-waving.gif',
  'failed': 'xilian-failed.gif',
};
```

- [ ] **Step 2: Typecheck**

Run: `pnpm --filter @mdzen/pet typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/pet/src/shared/types.ts
git commit -m "feat(pet): define shared types and gif state map"
```

---

## Task 4: FSM pure logic (TDD)

**Files:**
- Create: `packages/pet/src/client/fsm.ts`
- Test: `packages/pet/src/client/fsm.test.ts`

The FSM is a pure function: `(state, randomNumber) => nextState`. Tests pass deterministic numbers to make probability gates testable.

- [ ] **Step 1: Write the failing test**

Create `packages/pet/src/client/fsm.test.ts`:

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rollAutonomousTransition, type FsmTickInput } from './fsm.ts';

test('fsm: roll < 0.40 stays in idle', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.10 });
  assert.equal(next, 'idle');
});

test('fsm: 0.40 <= roll < 0.65 picks a walk direction', () => {
  const a = rollAutonomousTransition({ current: 'idle', random: 0.50 });
  assert.ok(a === 'walk-left' || a === 'walk-right', `got ${a}`);
});

test('fsm: 0.65 <= roll < 0.80 picks wandering', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.70 });
  assert.equal(next, 'wandering');
});

test('fsm: 0.80 <= roll < 0.90 picks jumping', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.85 });
  assert.equal(next, 'jumping');
});

test('fsm: 0.90 <= roll < 0.98 picks waiting', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.94 });
  assert.equal(next, 'waiting');
});

test('fsm: roll >= 0.98 picks running', () => {
  const next = rollAutonomousTransition({ current: 'idle', random: 0.99 });
  assert.equal(next, 'running');
});

test('fsm: non-idle state never auto-transitions', () => {
  const next = rollAutonomousTransition({ current: 'jumping', random: 0.99 });
  assert.equal(next, 'jumping');
});

test('fsm: review state cannot be overridden by autonomous roll', () => {
  const next = rollAutonomousTransition({ current: 'review', random: 0.50 });
  assert.equal(next, 'review');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mdzen/pet test`
Expected: FAIL with "Cannot find module './fsm.ts'".

- [ ] **Step 3: Write minimal implementation**

Create `packages/pet/src/client/fsm.ts`:

```ts
import type { FsmState } from '../shared/types.ts';

export interface FsmTickInput {
  current: FsmState;
  random: number;  // [0, 1)
}

const AUTONOMOUS_TABLE: Array<{ threshold: number; pick: (r: number) => FsmState }> = [
  { threshold: 0.40, pick: () => 'idle' },
  { threshold: 0.65, pick: (r) => (r < 0.525 ? 'walk-left' : 'walk-right') },
  { threshold: 0.80, pick: () => 'wandering' },
  { threshold: 0.90, pick: () => 'jumping' },
  { threshold: 0.98, pick: () => 'waiting' },
  { threshold: 1.00, pick: () => 'running' },
];

export function rollAutonomousTransition(input: FsmTickInput): FsmState {
  if (input.current !== 'idle') return input.current;
  for (const row of AUTONOMOUS_TABLE) {
    if (input.random < row.threshold) return row.pick(input.random);
  }
  return 'idle';
}

export const STATE_DURATIONS_MS: Readonly<Record<FsmState, [number, number]>> = {
  'idle': [0, 0],
  'walk-left': [3000, 6000],
  'walk-right': [3000, 6000],
  'running': [1500, 1500],
  'jumping': [1000, 1000],
  'waiting': [4000, 8000],
  'wandering': [6000, 12000],
  'review': [0, 0],
  'waving': [1500, 1500],
  'failed': [2000, 2000],
};

export function pickDuration(state: FsmState, random: number): number {
  const [lo, hi] = STATE_DURATIONS_MS[state];
  return lo + Math.floor(random * (hi - lo + 1));
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @mdzen/pet test`
Expected: all 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add packages/pet/src/client/fsm.ts packages/pet/src/client/fsm.test.ts
git commit -m "feat(pet): autonomous fsm transitions (pure logic)"
```

---

## Task 5: Boundary math (TDD)

**Files:**
- Create: `packages/pet/src/client/boundary.ts`
- Test: `packages/pet/src/client/boundary.test.ts`

Pure functions: compute allowed rect from viewport + excluded rects + padding; clamp a point into the bound.

- [ ] **Step 1: Write the failing test**

```ts
// packages/pet/src/client/boundary.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeBound, clampPoint, type Rect } from './boundary.ts';

test('boundary: full viewport with padding', () => {
  const b = computeBound({
    viewport: { w: 1000, h: 800 },
    excluded: [],
    padding: 24,
  });
  assert.deepEqual(b, { x: 24, y: 24, w: 952, h: 752 });
});

test('boundary: excluded right sidebar shrinks width', () => {
  const b = computeBound({
    viewport: { w: 1000, h: 800 },
    excluded: [{ x: 800, y: 0, w: 200, h: 800 }],
    padding: 0,
  });
  assert.equal(b.w, 800);
  assert.equal(b.h, 800);
});

test('boundary: excluded left sidebar shrinks width and shifts x', () => {
  const b = computeBound({
    viewport: { w: 1000, h: 800 },
    excluded: [{ x: 0, y: 0, w: 200, h: 800 }],
    padding: 0,
  });
  assert.equal(b.x, 200);
  assert.equal(b.w, 800);
});

test('clamp: point inside passes through', () => {
  const bound: Rect = { x: 100, y: 100, w: 500, h: 400 };
  assert.deepEqual(clampPoint({ x: 200, y: 200 }, bound), { x: 200, y: 200 });
});

test('clamp: point outside is clamped to edge', () => {
  const bound: Rect = { x: 100, y: 100, w: 500, h: 400 };
  assert.deepEqual(clampPoint({ x: 50, y: 50 }, bound), { x: 100, y: 100 });
  assert.deepEqual(clampPoint({ x: 9999, y: 9999 }, bound), { x: 600, y: 500 });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mdzen/pet test`
Expected: FAIL — module not found.

- [ ] **Step 3: Write the implementation**

```ts
// packages/pet/src/client/boundary.ts
export interface Rect { x: number; y: number; w: number; h: number; }

export interface ComputeBoundInput {
  viewport: { w: number; h: number };
  excluded: Rect[];
  padding: number;
}

export function computeBound(input: ComputeBoundInput): Rect {
  let { x, y, w, h } = { x: 0, y: 0, w: input.viewport.w, h: input.viewport.h };
  for (const ex of input.excluded) {
    // Greedy: subtract whichever side covers most of the viewport edge.
    const touchesLeft = ex.x <= x;
    const touchesRight = ex.x + ex.w >= x + w;
    const touchesTop = ex.y <= y;
    const touchesBottom = ex.y + ex.h >= y + h;
    if (touchesLeft && ex.w < w) {
      const cut = ex.x + ex.w - x;
      x += cut; w -= cut;
    } else if (touchesRight && ex.w < w) {
      w -= (x + w) - ex.x;
    } else if (touchesTop && ex.h < h) {
      const cut = ex.y + ex.h - y;
      y += cut; h -= cut;
    } else if (touchesBottom && ex.h < h) {
      h -= (y + h) - ex.y;
    }
  }
  return {
    x: x + input.padding,
    y: y + input.padding,
    w: Math.max(0, w - input.padding * 2),
    h: Math.max(0, h - input.padding * 2),
  };
}

export function clampPoint(p: { x: number; y: number }, b: Rect): { x: number; y: number } {
  return {
    x: Math.max(b.x, Math.min(b.x + b.w, p.x)),
    y: Math.max(b.y, Math.min(b.y + b.h, p.y)),
  };
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @mdzen/pet test`
Expected: all tests pass (5 in this file + 8 from fsm).

- [ ] **Step 5: Commit**

```bash
git add packages/pet/src/client/boundary.ts packages/pet/src/client/boundary.test.ts
git commit -m "feat(pet): boundary computation with exclusion and clamp"
```

---

## Task 6: Motion math (TDD)

**Files:**
- Create: `packages/pet/src/client/motion.ts`
- Test: `packages/pet/src/client/motion.test.ts`

Pure stepping function: given current pos, target, speed, dt → new pos + arrival flag. Used by walk/run/wander.

- [ ] **Step 1: Write the failing test**

```ts
// packages/pet/src/client/motion.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stepToward } from './motion.ts';

test('motion: full step when far away', () => {
  const r = stepToward({ from: { x: 0, y: 0 }, to: { x: 100, y: 0 }, speedPxPerSec: 100, dtSec: 0.5 });
  assert.equal(r.pos.x, 50);
  assert.equal(r.pos.y, 0);
  assert.equal(r.arrived, false);
});

test('motion: snap to target when within step distance', () => {
  const r = stepToward({ from: { x: 0, y: 0 }, to: { x: 10, y: 0 }, speedPxPerSec: 100, dtSec: 0.5 });
  assert.equal(r.pos.x, 10);
  assert.equal(r.arrived, true);
});

test('motion: arrival within ARRIVE_RADIUS counts as arrived', () => {
  const r = stepToward({ from: { x: 0, y: 0 }, to: { x: 30, y: 0 }, speedPxPerSec: 1000, dtSec: 0.001, arriveRadius: 32 });
  assert.equal(r.arrived, true);
});

test('motion: diagonal direction normalized', () => {
  const r = stepToward({ from: { x: 0, y: 0 }, to: { x: 100, y: 100 }, speedPxPerSec: Math.SQRT2 * 10, dtSec: 1 });
  // moves ~10 in each axis (sqrt(200) ≈ 14.14, but speed is along diagonal)
  assert.ok(Math.abs(r.pos.x - 10) < 0.01, `x=${r.pos.x}`);
  assert.ok(Math.abs(r.pos.y - 10) < 0.01, `y=${r.pos.y}`);
});

test('motion: choose facing direction from horizontal delta', () => {
  // imported separately
});

import { facingFromDelta } from './motion.ts';

test('facingFromDelta: positive dx → right', () => {
  assert.equal(facingFromDelta(50, 10), 'right');
});

test('facingFromDelta: negative dx → left', () => {
  assert.equal(facingFromDelta(-50, 10), 'left');
});

test('facingFromDelta: tiny dx with previous facing keeps facing', () => {
  // 5px movement under hysteresis threshold returns previous
  assert.equal(facingFromDelta(2, 200, 'right'), 'right');
  assert.equal(facingFromDelta(2, 200, 'left'), 'left');
});
```

- [ ] **Step 2: Verify failing**

Run: `pnpm --filter @mdzen/pet test`
Expected: FAIL — './motion.ts' not found.

- [ ] **Step 3: Implementation**

```ts
// packages/pet/src/client/motion.ts
export interface StepInput {
  from: { x: number; y: number };
  to: { x: number; y: number };
  speedPxPerSec: number;
  dtSec: number;
  arriveRadius?: number;  // default 32
}

export interface StepResult {
  pos: { x: number; y: number };
  arrived: boolean;
}

export function stepToward(input: StepInput): StepResult {
  const dx = input.to.x - input.from.x;
  const dy = input.to.y - input.from.y;
  const dist = Math.hypot(dx, dy);
  const arriveR = input.arriveRadius ?? 32;
  if (dist <= arriveR) return { pos: { ...input.to }, arrived: true };

  const step = input.speedPxPerSec * input.dtSec;
  if (step >= dist) return { pos: { ...input.to }, arrived: true };

  const nx = input.from.x + (dx / dist) * step;
  const ny = input.from.y + (dy / dist) * step;
  return { pos: { x: nx, y: ny }, arrived: false };
}

export type Facing = 'left' | 'right';

export function facingFromDelta(dx: number, hysteresisPx: number = 4, prev?: Facing): Facing {
  if (Math.abs(dx) < hysteresisPx && prev) return prev;
  return dx >= 0 ? 'right' : 'left';
}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @mdzen/pet test`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add packages/pet/src/client/motion.ts packages/pet/src/client/motion.test.ts
git commit -m "feat(pet): motion math with arrival detection and facing hysteresis"
```

---

## Task 7: Sprite + tick loop (DOM layer, no unit tests)

**Files:**
- Create: `packages/pet/src/client/sprite.ts`
- Create: `packages/pet/src/client/loop.ts`
- Create: `packages/pet/src/client/index.ts` (entry)

The DOM-touching code. We don't unit test this — it's exercised by the example in Task 13 and the smoke check in Task 15.

- [ ] **Step 1: Sprite element**

`packages/pet/src/client/sprite.ts`:

```ts
import type { FsmState } from '../shared/types.ts';
import { STATE_TO_GIF } from '../shared/types.ts';

const ASSETS_BASE = '/api/pet/assets/';

export interface SpriteOptions {
  size: number;          // px, default 64
  zIndex: number;        // default 9999
  initialState: FsmState;
}

export class Sprite {
  readonly el: HTMLDivElement;
  private img: HTMLImageElement;
  private state: FsmState;
  private facing: 'left' | 'right' = 'right';

  constructor(opts: SpriteOptions) {
    this.state = opts.initialState;
    this.el = document.createElement('div');
    Object.assign(this.el.style, {
      position: 'fixed', left: '0', top: '0',
      width: `${opts.size}px`, height: `${opts.size}px`,
      zIndex: String(opts.zIndex),
      pointerEvents: 'none',
      transform: 'translate(0, 0)',
      willChange: 'transform',
      userSelect: 'none',
    });
    this.img = document.createElement('img');
    Object.assign(this.img.style, {
      width: '100%', height: '100%',
      pointerEvents: 'auto',
      cursor: 'pointer',
    });
    this.img.src = ASSETS_BASE + STATE_TO_GIF[this.state];
    this.img.alt = 'pet';
    this.img.draggable = false;
    this.el.appendChild(this.img);
  }

  setState(s: FsmState): void {
    if (s === this.state) return;
    this.state = s;
    this.img.src = ASSETS_BASE + STATE_TO_GIF[s];
  }

  setPosition(x: number, y: number): void {
    this.el.style.transform = `translate(${x}px, ${y}px)`;
  }

  setFacing(f: 'left' | 'right'): void {
    if (f === this.facing) return;
    this.facing = f;
    // walk-left / walk-right gifs already encode direction; nothing to flip.
    // For symmetric states (idle, jumping) we could flip here. Phase 1 keeps it simple.
  }

  destroy(): void {
    this.el.remove();
  }
}
```

- [ ] **Step 2: Tick loop**

`packages/pet/src/client/loop.ts`:

```ts
import type { FsmState } from '../shared/types.ts';
import { rollAutonomousTransition, pickDuration } from './fsm.ts';
import { computeBound, clampPoint, type Rect } from './boundary.ts';
import { stepToward, facingFromDelta, type Facing } from './motion.ts';
import { Sprite } from './sprite.ts';

const FSM_TICK_MS = 10000;        // autonomous roll cadence
const SPEED_WALK = 90;
const SPEED_RUN = 380;

export interface LoopOptions {
  sprite: Sprite;
  getViewport: () => { w: number; h: number };
  getExcluded: () => Rect[];
  padding: number;
  rng?: () => number;
}

export class Loop {
  private state: FsmState = 'idle';
  private pos = { x: 100, y: 100 };
  private target: { x: number; y: number } | null = null;
  private facing: Facing = 'right';
  private nextTickAt = 0;
  private stateExpiresAt = 0;
  private rafHandle = 0;
  private rng: () => number;

  constructor(private opts: LoopOptions) {
    this.rng = opts.rng ?? Math.random;
    const b = this.bound();
    this.pos = { x: b.x + b.w * 0.9, y: b.y + b.h * 0.9 };
    this.opts.sprite.setPosition(this.pos.x, this.pos.y);
  }

  start(): void {
    let last = performance.now();
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (!document.hidden) this.tick(t, dt);
      this.rafHandle = requestAnimationFrame(frame);
    };
    this.rafHandle = requestAnimationFrame(frame);
  }

  stop(): void { cancelAnimationFrame(this.rafHandle); }

  private bound(): Rect {
    return computeBound({
      viewport: this.opts.getViewport(),
      excluded: this.opts.getExcluded(),
      padding: this.opts.padding,
    });
  }

  private tick(now: number, dt: number): void {
    // 1. Autonomous roll
    if (now >= this.nextTickAt) {
      this.nextTickAt = now + FSM_TICK_MS;
      const next = rollAutonomousTransition({ current: this.state, random: this.rng() });
      if (next !== this.state) this.enter(next, now);
    }

    // 2. State expiry (returns to idle)
    if (this.stateExpiresAt > 0 && now >= this.stateExpiresAt && this.state !== 'idle') {
      this.enter('idle', now);
    }

    // 3. Movement when applicable
    if (this.target && (this.state === 'walk-left' || this.state === 'walk-right' || this.state === 'wandering' || this.state === 'running')) {
      const speed = this.state === 'running' ? SPEED_RUN : SPEED_WALK;
      const r = stepToward({ from: this.pos, to: this.target, speedPxPerSec: speed, dtSec: dt, arriveRadius: 8 });
      this.pos = clampPoint(r.pos, this.bound());
      this.facing = facingFromDelta(this.target.x - this.pos.x, 4, this.facing);
      this.opts.sprite.setFacing(this.facing);
      this.opts.sprite.setPosition(this.pos.x, this.pos.y);
      if (r.arrived) {
        this.target = null;
        this.enter('idle', now);
      }
    }
  }

  private enter(next: FsmState, now: number): void {
    this.state = next;
    this.opts.sprite.setState(next);
    const dur = pickDuration(next, this.rng());
    this.stateExpiresAt = dur > 0 ? now + dur : 0;

    // pick target if movement state
    const b = this.bound();
    if (next === 'walk-left') {
      this.target = { x: Math.max(b.x, this.pos.x - 200), y: this.pos.y };
    } else if (next === 'walk-right') {
      this.target = { x: Math.min(b.x + b.w, this.pos.x + 200), y: this.pos.y };
    } else if (next === 'wandering') {
      this.target = {
        x: b.x + this.rng() * b.w,
        y: b.y + this.rng() * b.h,
      };
    } else if (next === 'running') {
      this.target = {
        x: this.pos.x < b.x + b.w / 2 ? b.x + b.w - 32 : b.x + 32,
        y: this.pos.y,
      };
    } else {
      this.target = null;
    }
  }
}
```

- [ ] **Step 3: Client entry**

`packages/pet/src/client/index.ts`:

```ts
import { Sprite } from './sprite.ts';
import { Loop } from './loop.ts';
import type { Rect } from './boundary.ts';

declare global {
  interface Window { __mdzenPet?: { stop: () => void }; }
}

function start(): void {
  if (window.__mdzenPet) return;  // idempotent for HMR
  const sprite = new Sprite({ size: 72, zIndex: 9999, initialState: 'idle' });
  document.body.appendChild(sprite.el);
  const config = (window as any).__MDZEN_PET_CONFIG__ ?? {};
  const excludedSelectors: string[] = config.excludeSelectors ?? ['.toc-sidebar', '.file-nav', '.preview-toc', '.preview-nav'];
  const padding: number = config.padding ?? 24;

  const getExcluded = (): Rect[] => {
    const out: Rect[] = [];
    for (const sel of excludedSelectors) {
      document.querySelectorAll(sel).forEach((node) => {
        const r = (node as HTMLElement).getBoundingClientRect();
        if (r.width > 0 && r.height > 0) out.push({ x: r.left, y: r.top, w: r.width, h: r.height });
      });
    }
    return out;
  };

  const loop = new Loop({
    sprite,
    getViewport: () => ({ w: window.innerWidth, h: window.innerHeight }),
    getExcluded,
    padding,
  });
  loop.start();

  window.__mdzenPet = { stop: () => { loop.stop(); sprite.destroy(); window.__mdzenPet = undefined; } };
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm --filter @mdzen/pet typecheck`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/pet/src/client/sprite.ts packages/pet/src/client/loop.ts packages/pet/src/client/index.ts
git commit -m "feat(pet): client sprite renderer + tick loop + entry"
```

---

## Task 8: esbuild client build script

**Files:**
- Create: `packages/pet/scripts/build-client.ts`
- Modify: `packages/pet/.gitignore` (create with `dist/`)

- [ ] **Step 1: Create gitignore**

`packages/pet/.gitignore`:

```
dist/
```

- [ ] **Step 2: Write build script**

`packages/pet/scripts/build-client.ts`:

```ts
import * as esbuild from 'esbuild';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');

mkdirSync(resolve(root, 'dist'), { recursive: true });

await esbuild.build({
  entryPoints: [resolve(root, 'src/client/index.ts')],
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  platform: 'browser',
  minify: true,
  sourcemap: false,
  outfile: resolve(root, 'dist/client.js'),
  legalComments: 'none',
});

console.log('built dist/client.js');
```

- [ ] **Step 3: Run build**

Run: `pnpm --filter @mdzen/pet build:client`
Expected output: `built dist/client.js`. File exists at `packages/pet/dist/client.js`.

- [ ] **Step 4: Verify bundle size**

Run: `wc -c packages/pet/dist/client.js`
Expected: < 30 KB (Phase 1 has no big deps).

- [ ] **Step 5: Commit**

```bash
git add packages/pet/scripts packages/pet/.gitignore
git commit -m "build(pet): esbuild client bundle script"
```

---

## Task 9: Server handler with asset endpoint (TDD)

**Files:**
- Create: `packages/pet/src/server/handler.ts`
- Test: `packages/pet/src/server/handler.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// packages/pet/src/server/handler.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { createPet } from '../index.ts';

async function withServer(fn: (port: number) => Promise<void>): Promise<void> {
  const pet = createPet({ workspaceRoot: process.cwd() });
  const server: Server = createServer(async (req, res) => {
    if (pet.matches(req)) return pet.handle(req, res);
    res.statusCode = 404; res.end();
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', () => r()));
  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  try {
    await fn(port);
  } finally {
    await pet.close();
    await new Promise<void>((r) => server.close(() => r()));
  }
}

test('handler: matches /api/pet/* paths', () => {
  const pet = createPet({ workspaceRoot: process.cwd() });
  assert.equal(pet.matches({ url: '/api/pet/assets/xilian-idle.gif' } as any), true);
  assert.equal(pet.matches({ url: '/foo' } as any), false);
  assert.equal(pet.matches({ url: '/api/pet' } as any), false);
});

test('handler: GET asset returns gif bytes', async () => {
  await withServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/assets/xilian-idle.gif`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/gif');
    const buf = new Uint8Array(await r.arrayBuffer());
    // GIF magic: 'GIF8'
    assert.equal(String.fromCharCode(buf[0]!, buf[1]!, buf[2]!, buf[3]!), 'GIF8');
  });
});

test('handler: GET unknown asset returns 404', async () => {
  await withServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/assets/notexist.gif`);
    assert.equal(r.status, 404);
  });
});

test('handler: GET asset blocks path traversal', async () => {
  await withServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/assets/..%2F..%2Fpackage.json`);
    assert.equal(r.status, 404);
  });
});

test('handler: GET client.js returns javascript', async () => {
  await withServer(async (port) => {
    const r = await fetch(`http://127.0.0.1:${port}/api/pet/client.js`);
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-type') ?? '', /javascript/);
    const text = await r.text();
    assert.ok(text.includes('xilian-idle.gif'), 'bundle should reference idle gif path');
  });
});

test('handler: scriptTag returns expected markup', () => {
  const pet = createPet({ workspaceRoot: process.cwd() });
  assert.equal(pet.scriptTag(), '<script src="/api/pet/client.js" defer></script>');
});

test('handler: scriptTag honors routePrefix', () => {
  const pet = createPet({ workspaceRoot: process.cwd(), routePrefix: '/_pet' });
  assert.equal(pet.scriptTag(), '<script src="/_pet/client.js" defer></script>');
});
```

- [ ] **Step 2: Run test to verify failure**

Run: `pnpm --filter @mdzen/pet test`
Expected: FAIL — `createPet` throws "not implemented yet".

- [ ] **Step 3: Implement handler**

`packages/pet/src/server/handler.ts`:

```ts
import { readFile } from 'node:fs/promises';
import { resolve, basename, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { CreatePetOptions, Pet } from '../shared/types.ts';
import { ALL_GIFS } from '../shared/types.ts';

const HERE_FILE = fileURLToPath(import.meta.url);
const PKG_ROOT = resolve(dirname(HERE_FILE), '../..');
const ASSETS_DIR = resolve(PKG_ROOT, 'src/assets');
const CLIENT_JS_PATH = resolve(PKG_ROOT, 'dist/client.js');

const GIF_SET = new Set(ALL_GIFS);

interface RuntimeState { clientCache: Buffer | null; }

export function buildPet(opts: CreatePetOptions): Pet {
  const prefix = (opts.routePrefix ?? '/api/pet').replace(/\/$/, '');
  const state: RuntimeState = { clientCache: null };

  const matches = (req: IncomingMessage): boolean => {
    const url = req.url ?? '';
    return url === `${prefix}/client.js` || url.startsWith(`${prefix}/assets/`);
  };

  const handle = async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const url = (req.url ?? '').split('?')[0]!;
      if (url === `${prefix}/client.js`) return await serveClient(state, res);
      if (url.startsWith(`${prefix}/assets/`)) return await serveAsset(url.slice(`${prefix}/assets/`.length), res);
      res.statusCode = 404; res.end();
    } catch (err) {
      res.statusCode = 500; res.end();
    }
  };

  const scriptTag = (): string => `<script src="${prefix}/client.js" defer></script>`;
  const close = async (): Promise<void> => { state.clientCache = null; };

  return { matches, handle, scriptTag, close };
}

async function serveAsset(rawName: string, res: ServerResponse): Promise<void> {
  let decoded: string;
  try { decoded = decodeURIComponent(rawName); } catch { res.statusCode = 404; res.end(); return; }
  const safe = basename(decoded);
  if (safe !== decoded || !GIF_SET.has(safe)) {
    res.statusCode = 404; res.end(); return;
  }
  try {
    const buf = await readFile(resolve(ASSETS_DIR, safe));
    res.statusCode = 200;
    res.setHeader('content-type', 'image/gif');
    res.setHeader('cache-control', 'public, max-age=86400');
    res.end(buf);
  } catch {
    res.statusCode = 404; res.end();
  }
}

async function serveClient(state: RuntimeState, res: ServerResponse): Promise<void> {
  if (!state.clientCache) {
    try { state.clientCache = await readFile(CLIENT_JS_PATH); }
    catch {
      res.statusCode = 503;
      res.setHeader('content-type', 'text/plain; charset=utf-8');
      res.end('client bundle missing — run `pnpm --filter @mdzen/pet build:client`');
      return;
    }
  }
  res.statusCode = 200;
  res.setHeader('content-type', 'application/javascript; charset=utf-8');
  res.setHeader('cache-control', 'public, max-age=300');
  res.end(state.clientCache);
}
```

- [ ] **Step 4: Wire factory in `packages/pet/src/index.ts`**

Replace the throwing stub:

```ts
import type { CreatePetOptions, Pet } from './shared/types.ts';
import { buildPet } from './server/handler.ts';

export type { CreatePetOptions, Pet, FsmState, Boundary, PersonalityConfig } from './shared/types.ts';

export function createPet(opts: CreatePetOptions): Pet {
  return buildPet(opts);
}
```

- [ ] **Step 5: Run tests**

Run: `pnpm --filter @mdzen/pet build:client && pnpm --filter @mdzen/pet test`
Expected: all 7 handler tests pass + earlier FSM/boundary/motion tests still green.

- [ ] **Step 6: Commit**

```bash
git add packages/pet/src/server/handler.ts packages/pet/src/server/handler.test.ts packages/pet/src/index.ts
git commit -m "feat(pet): http handler with asset and client.js endpoints"
```

---

## Task 10: mdzen adapter

**Files:**
- Create: `src/pet-adapter.ts`

- [ ] **Step 1: Write adapter**

```ts
// src/pet-adapter.ts
import { createPet } from '@mdzen/pet';
import { DOC_ROOT } from './config.ts';

export const pet = createPet({
  workspaceRoot: DOC_ROOT,
});
```

(Phase 1 is silent — no LLM, no contextTools, no env var read yet.)

- [ ] **Step 2: Typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/pet-adapter.ts
git commit -m "feat(mdzen): pet-adapter wires @mdzen/pet"
```

---

## Task 11: Wire pet into mdzen server.ts

**Files:**
- Modify: `src/server.ts`

We add a single dispatch line near the top of the request handler. Pet's `matches` is fast (just URL prefix check).

- [ ] **Step 1: Read current server.ts request handler**

Run: `grep -n "createServer" src/server.ts`
Use Read to view ~50 lines around the handler.

- [ ] **Step 2: Add import**

In the import block at top of `src/server.ts`, add:

```ts
import { pet } from './pet-adapter.ts';
```

- [ ] **Step 3: Add dispatch as first line of request handler**

Find the request handler (the function passed to `createServer`). Add as its first try-block statement:

```ts
if (pet.matches(req)) return pet.handle(req, res);
```

- [ ] **Step 4: Add close in shutdown path**

Find existing graceful-shutdown logic that calls `closeAllClients()`. Add `await pet.close();` adjacent.

- [ ] **Step 5: Run mdzen tests**

Run: `pnpm test`
Expected: all existing mdzen tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/server.ts
git commit -m "feat(mdzen): dispatch /api/pet/* to pet handler"
```

---

## Task 12: Inject scriptTag into preview template

**Files:**
- Modify: `src/templates.ts`

- [ ] **Step 1: Locate `getPreviewTemplate` and find body close `</body>`**

Run: `grep -n "</body>" src/templates.ts`

- [ ] **Step 2: Add import + tag injection**

At top of `src/templates.ts`, add:

```ts
import { pet } from './pet-adapter.ts';
```

Inside `getPreviewTemplate`, before `</body>`, inject:

```ts
${raw(pet.scriptTag())}
```

(`raw` is already imported in this file from `./utils/security.ts` for trusted HTML — verify with `grep -n "raw" src/templates.ts`.)

If `getHtmlTemplate` (the index page wrapper) also has a body close, inject there too — pet should appear on `/` too.

- [ ] **Step 3: Run mdzen tests**

Run: `pnpm test`
Expected: server.test.ts may need updates if it asserts exact HTML; if so, update assertions to permit the new script tag. Otherwise green.

- [ ] **Step 4: Smoke test manually**

```bash
pnpm --filter @mdzen/pet build:client
pnpm start
```

Open `http://localhost:<port>/` in a browser. Expected: pet GIF visible at lower-right area, animates idle, occasionally walks left/right or wanders.

- [ ] **Step 5: Commit**

```bash
git add src/templates.ts
git commit -m "feat(mdzen): inject pet client script into preview templates"
```

---

## Task 13: Pet package example/

**Files:**
- Create: `packages/pet/example/server.ts`
- Create: `packages/pet/example/index.html`
- Create: `packages/pet/example/README.md`

A standalone demo proving `@mdzen/pet` works without mdzen.

- [ ] **Step 1: Write `packages/pet/example/server.ts`**

```ts
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createPet } from '../src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const pet = createPet({ workspaceRoot: here });

const server = createServer(async (req, res) => {
  if (pet.matches(req)) return pet.handle(req, res);
  if (req.url === '/' || req.url === '/index.html') {
    const html = await readFile(resolve(here, 'index.html'), 'utf-8');
    res.statusCode = 200;
    res.setHeader('content-type', 'text/html; charset=utf-8');
    res.end(html.replace('{{PET_SCRIPT}}', pet.scriptTag()));
    return;
  }
  res.statusCode = 404; res.end();
});

server.listen(4000, () => console.log('http://localhost:4000'));
```

- [ ] **Step 2: Write `packages/pet/example/index.html`**

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>@mdzen/pet · example</title>
  <style>
    body { font: 14px system-ui; padding: 32px; max-width: 800px; margin: 0 auto; }
    h1 { color: #333; }
  </style>
</head>
<body>
  <h1>@mdzen/pet · standalone example</h1>
  <p>Pet should appear and wander around the page.</p>
  <p>Phase 1: no LLM, no triggers — just autonomous animation.</p>
  {{PET_SCRIPT}}
</body>
</html>
```

- [ ] **Step 3: Write `packages/pet/example/README.md`**

```markdown
# Example

```bash
pnpm --filter @mdzen/pet build:client
node --experimental-strip-types example/server.ts
# open http://localhost:4000
```
```

- [ ] **Step 4: Run example**

```bash
pnpm --filter @mdzen/pet build:client
cd packages/pet && node --experimental-strip-types example/server.ts
```

Open browser to `http://localhost:4000`, verify pet visible and moving.

- [ ] **Step 5: Commit**

```bash
git add packages/pet/example
git commit -m "docs(pet): standalone example server"
```

---

## Task 14: End-to-end smoke + CI sanity

- [ ] **Step 1: Run full test suite**

```bash
pnpm typecheck
pnpm test
pnpm --filter @mdzen/pet test
pnpm --filter @mdzen/pet typecheck
```

Expected: all green.

- [ ] **Step 2: Run mdzen with pet, click around**

```bash
pnpm --filter @mdzen/pet build:client
pnpm start
```

Manual checks (write each result down — these are the Phase 1 acceptance criteria):

1. Pet appears on `/` (file index page).
2. Pet appears on a `/view/<file>` markdown preview page.
3. Pet animation changes every 8-15 seconds (idle ↔ walk ↔ wander ↔ jumping ↔ waiting).
4. Pet stays inside boundary — does not overlap left file-nav or right TOC sidebar.
5. Resizing window: pet stays inside the new bound.
6. Closing & reopening tab: pet re-appears (idempotent mount).
7. `document.hidden` (switch tabs): no CPU work — verify via DevTools Performance.

- [ ] **Step 3: Build for publish (smoke only)**

```bash
pnpm build  # mdzen
pnpm --filter @mdzen/pet build:client
```

Expected: both succeed.

- [ ] **Step 4: Final commit (if any cleanup)**

```bash
git status
# only commit if there's accidental whitespace/import cleanup; otherwise skip
```

---

## Phase 1 Acceptance Criteria

- [ ] pnpm workspaces working; `mdzen` + `@mdzen/pet` resolve via workspace protocol.
- [ ] All 9 GIFs accessible via `GET /api/pet/assets/<name>.gif`, MIME `image/gif`, path traversal blocked.
- [ ] `GET /api/pet/client.js` returns the bundled IIFE; missing dist/client.js produces helpful 503 message.
- [ ] Pet visible on every mdzen preview page and the index page.
- [ ] FSM autonomous transitions match probability table (`fsm.test.ts` proves it).
- [ ] Pet movement clamps to boundary (`boundary.test.ts` proves it).
- [ ] Pet movement is smooth (no teleport in walk/wander; `motion.test.ts` proves the math).
- [ ] No new runtime deps in mdzen root package.json beyond `@mdzen/pet` (workspace).
- [ ] All existing mdzen tests still pass.
- [ ] `pnpm typecheck` green at root and in pet package.

---

## What ships next (Phase 2 plan to follow)

After Phase 1 is shipped and merged:

- **P2**: Triggers (selection, copy, idle, ceremonial) + probability gates + cooldowns + Bubble component (`passive` / `protest` / `thought` / `chat-stub` variants) + dragging + pulse halo when click-pet-while-selecting is armed.
- **P3**: Mischief (follow-cursor, pounce, scroll-chase, dodge-click, peek-on-load).
- **P4**: LangChain agent + chat panel + SSE streaming + tools (list/read/search) + system prompt assembly.
- **P5**: `propose_edit` tool + diff modal + `apply-edit` endpoint with race-condition protection.
- **P6**: Affection / Mood persistence + 5-zone behavior mapping + Hidden Meter.
- **P7**: LLM-generated contextual emotion + 3-layer protest line mixing + drag protests.
- **P8**: Performance polish, README, smoke harness, ship.

Each follow-up phase will be its own plan in `docs/superpowers/plans/`.
