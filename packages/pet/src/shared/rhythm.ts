// Daily rhythm — she has a baseline mood / energy / dialogue urge that
// shifts through the day independently of user interaction. This is the
// scaffolding for "she has her own day" rather than always-on tool.
//
// Pure compute, no IO. Imported by both server (system prompt injection)
// and client (FSM idleness modulation), so it lives in shared/.

export type DayPhase =
  | 'dawn'
  | 'morning'
  | 'noon'
  | 'afternoon'
  | 'evening'
  | 'night'
  | 'lateNight';

export interface RhythmSnapshot {
  phase: DayPhase;
  hour: number;
  /** 0-100 baseline mood independent of any user interaction. */
  baseMood: number;
  /** 0-100 how energetic she is — drives FSM idleness + animation cadence. */
  energyLevel: number;
  /** 0-1 likelihood she initiates conversation in this phase. */
  dialogueTendency: number;
  /** Short Chinese line describing her current vibe; fed verbatim to the LLM. */
  innerThought: string;
}

// 恋人 tone — these phrases are fed to the LLM, not displayed verbatim.
// The model uses them to color the reply; you'll rarely see the exact words.
const PROFILES: Record<DayPhase, Omit<RhythmSnapshot, 'phase' | 'hour'>> = {
  dawn: {
    baseMood: 55,
    energyLevel: 35,
    dialogueTendency: 0.08,
    innerThought: '刚醒, 还有点困... 但你也起这么早呀',
  },
  morning: {
    baseMood: 72,
    energyLevel: 75,
    dialogueTendency: 0.45,
    innerThought: '早上好, 今天我精神不错; 你呢',
  },
  noon: {
    baseMood: 62,
    energyLevel: 50,
    dialogueTendency: 0.25,
    innerThought: '中午了, 你吃饭了吗; 我有点想趴一会儿',
  },
  afternoon: {
    baseMood: 65,
    energyLevel: 60,
    dialogueTendency: 0.35,
    innerThought: '下午有点慢, 不过有你在就不觉得',
  },
  evening: {
    baseMood: 74,
    energyLevel: 68,
    dialogueTendency: 0.55,
    innerThought: '傍晚的光好看, 有点想你了',
  },
  night: {
    baseMood: 70,
    energyLevel: 45,
    dialogueTendency: 0.50,
    innerThought: '夜里安静下来了, 陪我一会儿吧',
  },
  lateNight: {
    baseMood: 62,
    energyLevel: 25,
    dialogueTendency: 0.18,
    innerThought: '这么晚还不睡呀, 我也舍不得睡',
  },
};

export function phaseOf(hour: number): DayPhase {
  if (hour < 5) return 'lateNight';
  if (hour < 7) return 'dawn';
  if (hour < 11) return 'morning';
  if (hour < 13) return 'noon';
  if (hour < 17) return 'afternoon';
  if (hour < 20) return 'evening';
  if (hour < 23) return 'night';
  return 'lateNight';
}

export function computeRhythm(date: Date): RhythmSnapshot {
  const hour = date.getHours();
  const phase = phaseOf(hour);
  return { phase, hour, ...PROFILES[phase] };
}

/** One-line system-prompt fragment so the LLM "feels" her current state. */
export function rhythmPromptLine(r: RhythmSnapshot): string {
  return `【她此刻状态】${r.innerThought}(${r.phase}, 精力${r.energyLevel}/100)`;
}

const WEEKDAY_CN = ['日', '一', '二', '三', '四', '五', '六'];

/**
 * Wall-clock prompt line — without this the model has phase ("evening") but
 * cannot answer "现在几点". Injected at chat-time and dream-time alike.
 */
export function nowPromptLine(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const h = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const w = WEEKDAY_CN[date.getDay()];
  return `【现在】${y}-${m}-${d} 周${w} ${h}:${min}`;
}
