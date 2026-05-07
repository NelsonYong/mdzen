export interface StepInput {
  from: { x: number; y: number };
  to: { x: number; y: number };
  speedPxPerSec: number;
  dtSec: number;
  arriveRadius?: number;
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
