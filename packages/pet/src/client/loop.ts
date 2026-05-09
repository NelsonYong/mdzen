import type { FsmState, MoveCommandKind, PetActivity } from '../shared/types.ts';
import { rollAutonomousTransition, pickDuration } from './fsm.ts';
import { computeBound, clampPoint, type Rect } from './boundary.ts';
import { stepToward, facingFromDelta, type Facing } from './motion.ts';
import type { Sprite } from './sprite.ts';
import {
  loadPetState,
  savePetState,
  expireStaleActivity,
  type StoredPetState,
} from './pet-state-store.ts';

const FSM_TICK_MS = 18000;
const SPEED_WALK = 90;
const SPEED_RUN = 380;
const SAVE_DEBOUNCE_MS = 1000;
// Refresh-target cadence for exercising. Jittered so two pets in same process
// don't synchronize and any single session feels organic.
const EXERCISE_TARGET_REFRESH_MIN_MS = 3500;
const EXERCISE_TARGET_REFRESH_MAX_MS = 7500;
// Fallback duration (seconds) if the LLM doesn't supply one. Chosen to be
// enough that "she goes away" feels real but short enough that she'll come
// back of her own accord. The LLM is encouraged to override.
const DEFAULT_TIMED_ACTIVITY_SEC = 240;

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
  // High-level activity (exercising / moved-aside / staying / idle) sitting on
  // top of the per-tick FSM. Restored from localStorage so reloads pick up
  // her in-progress activity instead of resetting to idle.
  private activity: PetActivity = { kind: 'idle' };
  private nextExerciseTargetAt = 0;
  private lastSavedAt = 0;

  constructor(opts: LoopOptions) {
    this.opts = opts;
    this.rng = opts.rng ?? Math.random;
    const b = this.bound();
    // Default fallback position (bottom-right corner). Persistence overrides
    // below when there's a valid stored state.
    this.pos = { x: b.x + b.w * 0.9, y: b.y + b.h * 0.9 };

    const stored = loadPetState();
    if (stored) {
      const fresh = expireStaleActivity(stored, Date.now());
      this.pos = clampPoint(fresh.pos, b);
      this.activity = fresh.activity;
    }
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

  /** Read-only access for code that needs to forward activity to the server. */
  getActivity(): PetActivity {
    return this.activity;
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

    // Activity expiry: drops her back into normal autonomous behavior.
    if (this.activity.kind !== 'idle' && (this.activity as { until: number }).until <= now) {
      this.activity = { kind: 'idle' };
      this.persistDebounced(now);
    }

    // Activity-driven targeting overrides autonomous FSM. exercising picks
    // a fresh wander target every few seconds; moved-aside / staying lock
    // her to a single target.
    if (this.activity.kind === 'exercising') {
      if (now >= this.nextExerciseTargetAt || !this.target) {
        const b = this.bound();
        this.target = { x: b.x + this.rng() * b.w, y: b.y + this.rng() * b.h };
        const span = EXERCISE_TARGET_REFRESH_MAX_MS - EXERCISE_TARGET_REFRESH_MIN_MS;
        this.nextExerciseTargetAt = now + EXERCISE_TARGET_REFRESH_MIN_MS + this.rng() * span;
        if (this.state !== 'wandering' && this.state !== 'running') {
          this.enter('wandering', now);
        }
      }
    } else if (this.activity.kind === 'moved-aside') {
      this.target = this.activity.target;
    } else if (this.activity.kind === 'staying') {
      this.target = null;
      if (this.state !== 'idle') this.enter('idle', now);
    } else if (!this.opts.disableAutonomous && now >= this.nextTickAt) {
      // Pure autonomous path — only reached when activity is idle.
      this.nextTickAt = now + FSM_TICK_MS;
      const next = rollAutonomousTransition({ current: this.state, random: this.rng() });
      if (next !== this.state) this.enter(next, now);
    }

    if (this.stateExpiresAt > 0 && now >= this.stateExpiresAt && this.state !== 'idle') {
      // moved-aside: arriving means switching to idle but staying locked at
      // target; the activity keeps her there until expiry.
      if (this.activity.kind === 'moved-aside') {
        this.enter('idle', now);
      } else {
        this.enter('idle', now);
      }
    }

    if (
      this.target &&
      (this.state === 'walk-left' ||
        this.state === 'walk-right' ||
        this.state === 'wandering' ||
        this.state === 'running')
    ) {
      const speed = this.state === 'running' ? SPEED_RUN : SPEED_WALK;
      const r = stepToward({
        from: this.pos,
        to: this.target,
        speedPxPerSec: speed,
        dtSec: dt,
        arriveRadius: 8,
      });
      this.pos = clampPoint(r.pos, this.bound());
      this.facing = facingFromDelta(this.target.x - this.pos.x, 4, this.facing);
      this.opts.sprite.setFacing(this.facing);
      this.opts.sprite.setPosition(this.pos.x, this.pos.y);
      this.persistDebounced(now);
      if (r.arrived) {
        this.target = null;
        // moved-aside / staying: arriving doesn't end the activity, just stops walking.
        if (this.activity.kind === 'moved-aside' || this.activity.kind === 'staying') {
          this.enter('idle', now);
        } else if (this.activity.kind !== 'exercising') {
          this.enter('idle', now);
        }
        // exercising falls through — next tick picks a fresh target.
      }
    }
  }

  /**
   * External movement command — wired to SSE move-command events from the
   * server. `move-aside` and `come-closer` compute concrete targets relative
   * to the current viewport; `exercise` and `stay` are timed activities.
   */
  setMoveCommand(kind: MoveCommandKind, durationSec?: number, now: number = Date.now()): void {
    console.log(
      `[seren loop] setMoveCommand: ${kind}${durationSec ? ` ${durationSec}s` : ''} | pos=(${this.pos.x.toFixed(0)},${this.pos.y.toFixed(0)}) prev-activity=${this.activity.kind}`,
    );
    const b = this.bound();
    // Duration always sourced from the LLM-supplied value; fallback only when
    // the model legitimately omits it. Never a hardcoded zone-scaled value —
    // life is random, the model picks.
    const dur = (durationSec && durationSec > 0 ? durationSec : DEFAULT_TIMED_ACTIVITY_SEC) * 1000;
    if (kind === 'move-aside') {
      // Pick the screen edge furthest from the current x — that's the most
      // likely "out of the way" direction.
      const cx = b.x + b.w / 2;
      const targetX = this.pos.x < cx ? b.x + 24 : b.x + b.w - 24;
      const target = { x: targetX, y: this.pos.y };
      this.activity = { kind: 'moved-aside', until: now + dur, target };
      this.target = target;
      this.enter(target.x < this.pos.x ? 'walk-left' : 'walk-right', now);
    } else if (kind === 'come-closer') {
      const cx = b.x + b.w / 2;
      const cy = b.y + b.h / 2;
      const target = { x: cx, y: cy };
      this.activity = { kind: 'idle' };
      this.target = target;
      this.enter(target.x < this.pos.x ? 'walk-left' : 'walk-right', now);
    } else if (kind === 'exercise') {
      this.activity = { kind: 'exercising', until: now + dur };
      this.nextExerciseTargetAt = 0; // pick a target on the next tick
    } else if (kind === 'stay') {
      this.activity = { kind: 'staying', until: now + dur, anchor: { ...this.pos } };
      this.target = null;
      this.enter('idle', now);
    } else if (kind === 'stop') {
      // Cancels any in-progress activity. She returns to autonomous idle and
      // may resume self-driven walks later — but the user-requested chase ends here.
      this.activity = { kind: 'idle' };
      this.target = null;
      this.enter('idle', now);
    }
    this.persistNow(now);
  }

  private persistDebounced(now: number): void {
    if (now - this.lastSavedAt < SAVE_DEBOUNCE_MS) return;
    this.persistNow(now);
  }

  private persistNow(now: number): void {
    const state: StoredPetState = {
      pos: { ...this.pos },
      activity: this.activity,
      savedAt: now,
    };
    savePetState(state);
    this.lastSavedAt = now;
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
