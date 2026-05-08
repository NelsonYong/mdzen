import type { FsmState } from '../shared/types.ts';

export interface FsmTickInput {
  current: FsmState;
  random: number;
}

const AUTONOMOUS_TABLE: ReadonlyArray<{ threshold: number; pick: (r: number) => FsmState }> = [
  // Desktop-companion principle: persistently visible, behaviorally calm.
  // Idle dominant (~75%); slow walks; the dramatic verbs (running, jumping)
  // are reserved for explicit triggers (greet on return, mischief, click reaction)
  // — they don't fire from the random tick.
  { threshold: 0.75, pick: () => 'idle' },
  { threshold: 0.85, pick: (r) => (r < 0.75 ? 'walk-left' : 'walk-right') },
  { threshold: 0.91, pick: () => 'wandering' },
  { threshold: 0.96, pick: () => 'jumping' },
  { threshold: 1.00, pick: () => 'waiting' },
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
