export const PRESET_LINES = {
  protest: ['唔!', '放我下来啦~', '好高...', '晕...', '你又这样'],
  thought: ['在想什么呢...', '嗯...', '唔, 有点困', '...'],
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
