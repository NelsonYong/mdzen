/**
 * Tiny markdown renderer for the pet's bubble + reader scroll.
 * Handles: paragraphs, headings (# ## ###), bold (**), italic (*),
 * inline code, fenced code blocks, blockquote (>), unordered/ordered lists,
 * horizontal rule (---). HTML in input is escaped first; output is safe to
 * inject as innerHTML.
 *
 * NOT a full markdown parser — keeps the runtime cost tiny (~2KB minified).
 */
export function renderMarkdownTiny(input: string): string {
  let s = escapeHtml(input);

  // Fenced code block: ```lang\n...\n```
  s = s.replace(/```(\w*)\r?\n?([\s\S]*?)```/g, (_m, _lang, body) => {
    return `<pre class="mdzen-md-code"><code>${body}</code></pre>`;
  });

  // Process line by line for block-level constructs.
  const lines = s.split(/\r?\n/);
  const out: string[] = [];
  let inUl = false;
  let inOl = false;
  let inBq = false;
  let inPara = false;

  const closeUl = (): void => {
    if (inUl) {
      out.push('</ul>');
      inUl = false;
    }
  };
  const closeOl = (): void => {
    if (inOl) {
      out.push('</ol>');
      inOl = false;
    }
  };
  const closeBq = (): void => {
    if (inBq) {
      out.push('</blockquote>');
      inBq = false;
    }
  };
  const closePara = (): void => {
    if (inPara) {
      out.push('</p>');
      inPara = false;
    }
  };
  const closeAll = (): void => {
    closeUl();
    closeOl();
    closeBq();
    closePara();
  };

  for (const rawLine of lines) {
    const line = rawLine;
    // pre-rendered code block markers — keep as-is
    if (line.startsWith('<pre') || line.startsWith('</pre') || line.startsWith('<code') || line.startsWith('</code')) {
      closeAll();
      out.push(line);
      continue;
    }

    if (/^\s*---+\s*$/.test(line)) {
      closeAll();
      out.push('<hr>');
      continue;
    }

    const h = /^(#{1,3})\s+(.+?)\s*$/.exec(line);
    if (h) {
      closeAll();
      const lvl = h[1]!.length;
      out.push(`<h${lvl} class="mdzen-md-h">${inline(h[2]!)}</h${lvl}>`);
      continue;
    }

    const ul = /^\s*[-*]\s+(.+)$/.exec(line);
    if (ul) {
      closePara();
      closeOl();
      closeBq();
      if (!inUl) {
        out.push('<ul class="mdzen-md-list">');
        inUl = true;
      }
      out.push(`<li>${inline(ul[1]!)}</li>`);
      continue;
    }

    const ol = /^\s*\d+\.\s+(.+)$/.exec(line);
    if (ol) {
      closePara();
      closeUl();
      closeBq();
      if (!inOl) {
        out.push('<ol class="mdzen-md-list">');
        inOl = true;
      }
      out.push(`<li>${inline(ol[1]!)}</li>`);
      continue;
    }

    const bq = /^\s*&gt;\s?(.*)$/.exec(line);
    if (bq) {
      closePara();
      closeUl();
      closeOl();
      if (!inBq) {
        out.push('<blockquote class="mdzen-md-bq">');
        inBq = true;
      }
      out.push(`<p>${inline(bq[1] ?? '')}</p>`);
      continue;
    }

    if (line.trim() === '') {
      closeAll();
      continue;
    }

    closeUl();
    closeOl();
    closeBq();
    if (!inPara) {
      out.push('<p>');
      inPara = true;
    } else {
      out.push('<br>');
    }
    out.push(inline(line));
  }
  closeAll();
  return out.join('');
}

function inline(s: string): string {
  // inline code first (so ** inside code is preserved)
  s = s.replace(/`([^`\n]+)`/g, '<code class="mdzen-md-ic">$1</code>');
  // bold
  s = s.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
  // italic (avoid mid-word _)
  s = s.replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s.,;!?)]|$)/g, '$1<em>$2</em>');
  return s;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
