export interface EmotionState {
  affection: number;
  mood: number;
  lastUpdated: number;
  contextualPhrase?: string;
  contextualPhraseAt?: number;
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
  });
}

function clampState(s: EmotionState): EmotionState {
  return {
    ...s,
    affection: Math.max(0, Math.min(100, s.affection)),
    mood: Math.max(0, Math.min(100, s.mood)),
  };
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
