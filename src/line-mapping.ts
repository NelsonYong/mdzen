import type { Marked } from 'marked';

interface BlockLineEntry {
  type: string;
  line: number;
}

export interface LineMappingContext {
  reset(markdown: string, lineOffset?: number): void;
  consume(tokenType: string): string;
}

export function createLineMapping(marked: Marked): LineMappingContext {
  let queue: BlockLineEntry[] = [];

  return {
    reset(markdown: string, lineOffset = 1): void {
      const tokens = marked.lexer(markdown);
      queue = [];
      let offset = 0;
      for (const token of tokens) {
        if (token.type === 'space') {
          offset += token.raw.length;
          continue;
        }
        const line = lineOffset + countNewlines(markdown, offset);
        queue.push({ type: token.type, line });
        offset += token.raw.length;
      }
    },
    consume(tokenType: string): string {
      if (queue.length > 0 && queue[0]!.type === tokenType) {
        const entry = queue.shift()!;
        return ` data-source-line="${entry.line}"`;
      }
      return '';
    },
  };
}

function countNewlines(text: string, end: number): number {
  let count = 0;
  for (let i = 0; i < end; i++) {
    if (text.charCodeAt(i) === 10) count++;
  }
  return count;
}
