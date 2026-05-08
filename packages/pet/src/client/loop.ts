import type { FsmState } from '../shared/types.ts';
import { rollAutonomousTransition, pickDuration } from './fsm.ts';
import { computeBound, clampPoint, type Rect } from './boundary.ts';
import { stepToward, facingFromDelta, type Facing } from './motion.ts';
import type { Sprite } from './sprite.ts';

const FSM_TICK_MS = 18000;
const SPEED_WALK = 90;
const SPEED_RUN = 380;

export interface LoopOptions {
  sprite: Sprite;
  getViewport: () => { w: number; h: number };
  getExcluded: () => Rect[];
  padding: number;
  rng?: () => number;
  /** If true, skip autonomous FSM transitions. Explicit setState/target follow still work. */
  disableAutonomous?: boolean;
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
  private frozen = false;
  private opts: LoopOptions;

  constructor(opts: LoopOptions) {
    this.opts = opts;
    this.rng = opts.rng ?? Math.random;
    const b = this.bound();
    this.pos = { x: b.x + b.w * 0.9, y: b.y + b.h * 0.9 };
    this.opts.sprite.setPosition(this.pos.x, this.pos.y);
  }

  start(): void {
    let last = performance.now();
    const frame = (t: number): void => {
      const dt = Math.min(0.05, (t - last) / 1000);
      last = t;
      if (!document.hidden) this.tick(t, dt);
      this.rafHandle = requestAnimationFrame(frame);
    };
    this.rafHandle = requestAnimationFrame(frame);
  }

  stop(): void {
    cancelAnimationFrame(this.rafHandle);
  }

  freeze(): void {
    this.frozen = true;
    this.target = null;
  }

  unfreeze(): void {
    this.frozen = false;
  }

  setPosition(x: number, y: number): void {
    this.pos = { x, y };
  }

  private bound(): Rect {
    return computeBound({
      viewport: this.opts.getViewport(),
      excluded: this.opts.getExcluded(),
      padding: this.opts.padding,
    });
  }

  private tick(now: number, dt: number): void {
    if (this.frozen) return;
    if (!this.opts.disableAutonomous && now >= this.nextTickAt) {
      this.nextTickAt = now + FSM_TICK_MS;
      const next = rollAutonomousTransition({ current: this.state, random: this.rng() });
      if (next !== this.state) this.enter(next, now);
    }

    if (this.stateExpiresAt > 0 && now >= this.stateExpiresAt && this.state !== 'idle') {
      this.enter('idle', now);
    }

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
