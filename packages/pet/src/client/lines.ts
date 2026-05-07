import { pickPreset, type PresetCategory } from './presets.ts';
import { globalEmotion } from './emotion-client.ts';

const CONTEXTUAL_USE_PROB = 0.4;

export function mixedLine(category: PresetCategory): string {
  const phrase = globalEmotion.contextualPhrase();
  if (phrase && Math.random() < CONTEXTUAL_USE_PROB) {
    return phrase;
  }
  return pickPreset(category);
}
