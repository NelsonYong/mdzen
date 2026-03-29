import { marked } from 'marked';

interface BlockLineEntry {
  type: string;
  line: number;
}

/** Module-level queue — reset before each render pass via resetBlockLineQueue(). */
let blockLineQueue: BlockLineEntry[] = [];

/**
 * Compute line numbers for top-level block tokens and store them in a queue.
 * Must be called before `marked.parse()` for each render.
 */
export function resetBlockLineQueue(markdown: string, lineOffset = 1): void {
  const tokens = marked.lexer(markdown);
  blockLineQueue = [];
  let offset = 0;

  for (const token of tokens) {
    if (token.type === 'space') {
      offset += token.raw.length;
      continue;
    }
    const line = lineOffset + countNewlines(markdown, offset);
    blockLineQueue.push({ type: token.type, line });
    offset += token.raw.length;
  }
}

/**
 * Try to consume the next queue entry if the front's token type matches.
 * Returns ` data-source-line="N"` on match, empty string otherwise.
 *
 * Because marked renders container children *before* the container itself,
 * a nested element (e.g. <p> inside <blockquote>) will find the queue front
 * is 'blockquote', not 'paragraph', and correctly skip consumption.
 */
export function consumeLineAttr(tokenType: string): string {
  if (blockLineQueue.length > 0 && blockLineQueue[0]!.type === tokenType) {
    const entry = blockLineQueue.shift()!;
    return ` data-source-line="${entry.line}"`;
  }
  return '';
}

function countNewlines(text: string, end: number): number {
  let count = 0;
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}
