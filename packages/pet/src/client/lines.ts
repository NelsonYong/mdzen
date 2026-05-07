import { pickPreset, type PresetCategory } from './presets.ts';

// Bubble lines stay first-person from the pet's mouth. The server-side
// contextualPhrase is third-person ("她有点不安"), suitable only for the
// LLM system prompt — never for bubble display.
export function mixedLine(category: PresetCategory): string {
  return pickPreset(category);
}
