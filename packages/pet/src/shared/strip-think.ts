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

/**
 * Strip Markdown code fences (```json / ```ts / plain ```) from a string.
 * Many models ignore "不要 \`\`\` 包裹" instructions and still wrap JSON in
 * fences — without this, JSON.parse would throw and the caller would silently
 * fall back to the deterministic pool. Idempotent: no-op if no fences found.
 */
export function stripCodeFences(s: string): string {
  // Pattern: optional leading newline, ``` with optional language tag, body,
  // closing ```. Captures the body. Greedy on body so we match the outer
  // pair correctly when there's text outside.
  const m = s.match(/```(?:[a-zA-Z0-9_-]+)?\s*\n?([\s\S]*?)\n?\s*```/);
  return (m && m[1] !== undefined ? m[1] : s).trim();
}

/**
 * Best-effort extraction of the first balanced JSON object/array from text.
 * Used as a fallback when the model surrounds JSON with prose like
 * "好的, 这是结果: {...} 希望对你有帮助". Returns null if no balanced shape
 * is found; the caller should treat that as the LLM having failed.
 */
export function extractJsonBlob(s: string): string | null {
  const openIdx = s.search(/[{[]/);
  if (openIdx < 0) return null;
  const open = s[openIdx]!;
  const close = open === '{' ? '}' : ']';
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = openIdx; i < s.length; i++) {
    const c = s[i]!;
    if (escape) {
      escape = false;
      continue;
    }
    if (c === '\\' && inString) {
      escape = true;
      continue;
    }
    if (c === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (c === open) depth++;
    else if (c === close) {
      depth--;
      if (depth === 0) return s.slice(openIdx, i + 1);
    }
  }
  return null;
}
