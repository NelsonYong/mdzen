export interface EmotionState {
  affection: number;
  mood: number;
  lastUpdated: number;
  contextualPhrase?: string;
  contextualPhraseAt?: number;
  /**
   * Set when the most recent chat turn was a mood-gated refusal. Cleared on
   * the next willing reply. Drives the "patient follow-up" boost — if the
   * user keeps engaging despite refusal, they get a per-turn affection bump
   * roughly equal to a `sorry` event.
   */
  lastRefusalAt?: number;
}

export type AffectionZone = 'adored' | 'friendly' | 'sulky' | 'cold' | 'hiding';

export function affectionZone(a: number): AffectionZone {
  if (a >= 80) return 'adored';
  if (a >= 50) return 'friendly';
  if (a >= 25) return 'sulky';
  if (a >= 10) return 'cold';
  return 'hiding';
}

export type EmotionEvent =
  | 'click'
  | 'apply-diff'
  | 'open-chat'
  | 'chat-turn'
  | 'sorry'
  | 'bubble-ignored'
  | 'chat-quick-close'
  | 'diff-rejected'
  | 'idle-hour'
  | 'drag-1st'
  | 'drag-3plus'
  | 'drag-too-long';

export const EVENT_DELTAS: Readonly<Record<EmotionEvent, { affection: number; mood: number }>> = {
  click: { affection: +3, mood: +3 },
  'apply-diff': { affection: +5, mood: +6 },
  'open-chat': { affection: +2, mood: +2 },
  'chat-turn': { affection: +1, mood: +1 },
  sorry: { affection: +5, mood: +6 },
  'bubble-ignored': { affection: -2, mood: -3 },
  'chat-quick-close': { affection: -1, mood: -2 },
  'diff-rejected': { affection: -1, mood: -2 },
  'idle-hour': { affection: -0.5, mood: -1 },
  'drag-1st': { affection: -1, mood: -3 },
  'drag-3plus': { affection: -3, mood: -8 },
  'drag-too-long': { affection: -2, mood: -5 },
};

export function applyEvent(s: EmotionState, ev: EmotionEvent, now: number): EmotionState {
  const d = EVENT_DELTAS[ev];
  return clampState({
    affection: s.affection + d.affection,
    mood: s.mood + d.mood,
    lastUpdated: now,
    contextualPhrase: s.contextualPhrase,
    contextualPhraseAt: s.contextualPhraseAt,
    lastRefusalAt: s.lastRefusalAt,
  });
}

/** Time after a refusal during which a follow-up counts as patient (10 min). */
export const PATIENT_FOLLOWUP_WINDOW_MS = 10 * 60_000;
/** Below this, the follow-up looks spammy rather than patient — no boost. */
export const PATIENT_FOLLOWUP_MIN_GAP_MS = 30_000;
/** Bump applied on each patient follow-up turn. Roughly equals 'sorry'. */
export const PATIENT_FOLLOWUP_DELTA: { affection: number; mood: number } = {
  affection: 5,
  mood: 7,
};

/**
 * If the user is following up after a recent refusal (within 10 min, but at
 * least 30s — so spam doesn't farm it), return a state with the boost applied
 * and `lastRefusalAt` preserved (so subsequent retries can also boost). Else
 * return the input unchanged.
 *
 * Pure — caller decides whether to persist.
 */
export function applyPatientFollowUp(s: EmotionState, now: number): EmotionState {
  if (typeof s.lastRefusalAt !== 'number') return s;
  const gap = now - s.lastRefusalAt;
  if (gap < PATIENT_FOLLOWUP_MIN_GAP_MS) return s;
  if (gap > PATIENT_FOLLOWUP_WINDOW_MS) return s;
  return clampState({
    affection: s.affection + PATIENT_FOLLOWUP_DELTA.affection,
    mood: s.mood + PATIENT_FOLLOWUP_DELTA.mood,
    lastUpdated: now,
    contextualPhrase: s.contextualPhrase,
    contextualPhraseAt: s.contextualPhraseAt,
    lastRefusalAt: s.lastRefusalAt,
  });
}

export function tickRecovery(s: EmotionState, now: number): EmotionState {
  const minutes = (now - s.lastUpdated) / 60_000;
  if (minutes < 1) return s;
  const moodToward50 = (50 - s.mood) * Math.min(0.5, minutes / 20);
  return clampState({
    affection: s.affection + 0.2 * minutes,
    mood: s.mood + moodToward50,
    lastUpdated: now,
    contextualPhrase: s.contextualPhrase,
    contextualPhraseAt: s.contextualPhraseAt,
    lastRefusalAt: s.lastRefusalAt,
  });
}

function clampState(s: EmotionState): EmotionState {
  const out: EmotionState = {
    affection: Math.max(0, Math.min(100, s.affection)),
    mood: Math.max(0, Math.min(100, s.mood)),
    lastUpdated: s.lastUpdated,
  };
  if (s.contextualPhrase !== undefined) out.contextualPhrase = s.contextualPhrase;
  if (s.contextualPhraseAt !== undefined) out.contextualPhraseAt = s.contextualPhraseAt;
  if (s.lastRefusalAt !== undefined) out.lastRefusalAt = s.lastRefusalAt;
  return out;
}

export const PRESET_PHRASES: Readonly<Record<AffectionZone, string>> = {
  adored: '你今天心情很好, 语气可以更活泼, 适当撒娇。',
  friendly: '保持温柔, 简洁回应。',
  sulky: '你最近被晾了几次, 有点小脾气。回应短一点, 语气微凉但不过分。用户表达善意立刻软化。',
  cold: '你正在生气。除非用户明显道歉或问得真诚, 否则只回"嗯"/"…"/"随便你"。',
  hiding: '你藏起来了, 不主动说话。',
};

export function INITIAL_STATE(now: number): EmotionState {
  return { affection: 60, mood: 50, lastUpdated: now };
}
