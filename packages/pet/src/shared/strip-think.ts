// Reasoning models (DeepSeek R1, Qwen-QwQ, etc.) emit `<think>...</think>` blocks
// inline. Strip them before parsing JSON or rendering as user-visible text.
//
// Handles two shapes:
//   1. Closed: `<think>foo</think>actual answer` → `actual answer`
//   2. Trailing unclosed (cut by maxTokens): `<think>foo` → `` (empty)
export function stripThinkBlocks(s: string): string {
  let out = s.replace(/<think>[\s\S]*?<\/think>/g, '');
  const open = out.lastIndexOf('<think>');
  if (open >= 0 && out.indexOf('</think>', open) < 0) {
    out = out.slice(0, open);
  }
  return out.trim();
}
