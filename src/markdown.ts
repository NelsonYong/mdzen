import { Marked, type Tokens, type RendererThis } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import { readFileSync } from 'node:fs';

import { DOC_ROOT } from './config.ts';
import type { TocItem, MarkdownResult } from './types.ts';
import { createLineMapping, type LineMappingContext } from './line-mapping.ts';
import { escapeHtml, html, raw, safeResolve, PathTraversalError } from './utils/security.ts';

type AdmonitionType = 'info' | 'tip' | 'warning' | 'danger' | 'caution' | 'note';

const ADMONITION_LABEL: Record<AdmonitionType, string> = {
  info: 'INFO',
  tip: 'TIP',
  warning: 'WARNING',
  danger: 'DANGER',
  caution: 'CAUTION',
  note: 'NOTE',
};

interface AdmonitionToken {
  type: 'admonition';
  raw: string;
  admonitionType: AdmonitionType;
  title: string;
  tokens: Tokens.Generic[];
}

interface MermaidToken {
  type: 'mermaid';
  raw: string;
  text: string;
}

export function generateUniqueId(text: string, usedIds: Set<string>): string {
  const baseId = text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w一-龥]+/g, '-')
    .replace(/^-+|-+$/g, '');

  let id = baseId;
  let counter = 1;
  while (usedIds.has(id)) {
    id = `${baseId}-${counter}`;
    counter++;
  }
  usedIds.add(id);
  return id;
}

interface RenderContext {
  marked: Marked;
  usedIds: Set<string>;
  lineMapping: LineMappingContext;
}

function createRenderContext(): RenderContext {
  const m = new Marked();
  const usedIds = new Set<string>();
  const lineMapping = createLineMapping(m);

  m.use(
    markedHighlight({
      emptyLangClass: 'hljs',
      langPrefix: 'hljs language-',
      highlight(code: string, lang: string): string {
        if (lang && hljs.getLanguage(lang)) {
          try {
            return hljs.highlight(code, { language: lang }).value;
          } catch {
            /* fall through to auto-detect */
          }
        }
        try {
          return hljs.highlightAuto(code).value;
        } catch {
          return code;
        }
      },
    }),
  );

  m.use({
    renderer: {
      heading(token) {
        const id = generateUniqueId(token.text, usedIds);
        const lineAttr = lineMapping.consume('heading');
        return `<h${token.depth}${lineAttr} id="${id}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
      },
      paragraph(token) {
        const lineAttr = lineMapping.consume('paragraph');
        return `<p${lineAttr}>${this.parser.parseInline(token.tokens)}</p>\n`;
      },
      code(token) {
        const lineAttr = lineMapping.consume('code');
        const lang = (token.lang ?? '').match(/^\S*/)?.[0] ?? '';
        const langClass = lang ? `hljs language-${lang}` : 'hljs';
        const text = token.text.replace(/\n$/, '') + '\n';
        const code = token.escaped ? text : escapeHtml(text);
        return `<pre${lineAttr} data-lang="${escapeHtml(lang)}"><code class="${langClass}">${code}</code></pre>\n`;
      },
      blockquote(token) {
        const lineAttr = lineMapping.consume('blockquote');
        const body = this.parser.parse(token.tokens);
        return `<blockquote${lineAttr}>\n${body}</blockquote>\n`;
      },
      list(token) {
        const lineAttr = lineMapping.consume('list');
        const tag = token.ordered ? 'ol' : 'ul';
        const startAttr = token.ordered && token.start !== 1 ? ` start="${token.start}"` : '';
        let body = '';
        for (const item of token.items) {
          body += this.listitem(item);
        }
        return `<${tag}${startAttr}${lineAttr}>\n${body}</${tag}>\n`;
      },
      table(token) {
        const lineAttr = lineMapping.consume('table');
        let headerCells = '';
        for (const cell of token.header) {
          headerCells += this.tablecell(cell);
        }
        const header = this.tablerow({ text: headerCells });
        let body = '';
        for (const row of token.rows) {
          let rowCells = '';
          for (const cell of row) {
            rowCells += this.tablecell(cell);
          }
          body += this.tablerow({ text: rowCells });
        }
        if (body) body = `<tbody>${body}</tbody>`;
        // Wrap in a horizontally-scrollable container so wide tables don't break the layout.
        // line-attr stays on the <table> so editor-jump still targets the right source line.
        return `<div class="table-wrap" tabindex="0" role="region" aria-label="表格"><table${lineAttr}>\n<thead>\n${header}</thead>\n${body}</table></div>\n`;
      },
      hr() {
        const lineAttr = lineMapping.consume('hr');
        return `<hr${lineAttr}>\n`;
      },
      html(token) {
        lineMapping.consume('html');
        return token.text;
      },
      image(token) {
        const text = escapeHtml(token.text ?? '');
        const titleAttr = token.title ? ` title="${escapeHtml(token.title)}"` : '';
        const href = escapeHtml(token.href ?? '');
        return `<img src="${href}" alt="${text}"${titleAttr} loading="lazy" decoding="async">`;
      },
    },
  });

  m.use({
    extensions: [
      {
        // Catch ```mermaid blocks BEFORE the regular code tokenizer so highlight.js never touches them.
        // Emit a <pre class="mermaid"> with the raw source — the client mermaid loader picks these up.
        name: 'mermaid',
        level: 'block' as const,
        start(src: string): number {
          return src.indexOf('```mermaid');
        },
        tokenizer(src: string): MermaidToken | undefined {
          const match = /^```mermaid[ \t]*\n([\s\S]*?)\n```(?:\n|$)/.exec(src);
          if (match) {
            return { type: 'mermaid', raw: match[0]!, text: match[1] ?? '' };
          }
          return undefined;
        },
        renderer(token: Tokens.Generic): string {
          const t = token as unknown as MermaidToken;
          const lineAttr = lineMapping.consume('mermaid');
          return `<pre class="mermaid" data-mermaid-source="true"${lineAttr}>${escapeHtml(t.text)}</pre>\n`;
        },
      },
      {
        name: 'admonition',
        level: 'block' as const,
        start(src: string): number {
          return src.indexOf(':::');
        },
        tokenizer(src: string): AdmonitionToken | undefined {
          const rule = /^:::(info|tip|warning|danger|caution|note)([ \t]+[^\n]*)?\n([\s\S]*?)\n:::/;
          const match = rule.exec(src);
          if (match) {
            return {
              type: 'admonition',
              raw: match[0]!,
              admonitionType: match[1] as AdmonitionType,
              title: match[2] ? match[2].trim() : '',
              tokens: m.Lexer.lex(match[3] ?? ''),
            };
          }
          return undefined;
        },
        renderer(this: RendererThis, token: Tokens.Generic): string {
          const t = token as unknown as AdmonitionToken;
          const lineAttr = lineMapping.consume('admonition');
          const title = t.title || ADMONITION_LABEL[t.admonitionType];
          const content = this.parser.parse(t.tokens);
          return (
            `<div class="admonition admonition-${t.admonitionType}"${lineAttr}>` +
            `<div class="admonition-title">${escapeHtml(title)}</div>` +
            `<div class="admonition-content">${content}</div>` +
            `</div>\n`
          );
        },
      },
    ],
  });

  return { marked: m, usedIds, lineMapping };
}

export function parseFrontmatter(content: string): {
  frontmatter: Record<string, string | boolean> | null;
  body: string;
} {
  const normalized = content.replace(/\r\n/g, '\n');
  const match = normalized.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: null, body: normalized };

  const frontmatter: Record<string, string | boolean> = {};
  for (const line of match[1]!.split('\n')) {
    const colonIndex = line.indexOf(':');
    if (colonIndex <= 0) continue;

    const key = line.slice(0, colonIndex).trim();
    let value: string | boolean = line.slice(colonIndex + 1).trim();

    if (
      (value.startsWith("'") && value.endsWith("'")) ||
      (value.startsWith('"') && value.endsWith('"'))
    ) {
      value = value.slice(1, -1);
    }
    if (value === 'true') value = true;
    else if (value === 'false') value = false;

    frontmatter[key] = value;
  }

  return { frontmatter, body: match[2]! };
}

export interface PreWalkResult {
  toc: TocItem[];
}

function preWalkForToc(marked: Marked, body: string): TocItem[] {
  const tokens = marked.lexer(body);
  const usedIds = new Set<string>();
  const toc: TocItem[] = [];
  for (const token of tokens) {
    if (token.type === 'heading' && (token as Tokens.Heading).depth <= 4) {
      const t = token as Tokens.Heading;
      toc.push({
        level: t.depth,
        text: t.text.trim(),
        id: generateUniqueId(t.text.trim(), usedIds),
      });
    }
  }
  return toc;
}

export function extractToc(markdown: string): TocItem[] {
  const m = new Marked();
  return preWalkForToc(m, markdown.replace(/\r\n/g, '\n'));
}

export function renderToc(toc: TocItem[]): string {
  if (toc.length === 0) return '<div class="toc-empty">暂无目录</div>';

  const minLevel = Math.min(...toc.map((item) => item.level));
  return toc
    .map((item) =>
      html`<a href="#${raw(item.id)}" class="toc-item toc-level-${item.level}" data-level="${item.level - minLevel}" title="${item.text}">${item.text}</a>`,
    )
    .join('\n');
}

export function getMarkdownWithToc(filename: string): MarkdownResult | null {
  let filepath: string;
  try {
    filepath = safeResolve(DOC_ROOT, filename);
  } catch (err) {
    if (err instanceof PathTraversalError) return null;
    throw err;
  }

  let content: string;
  try {
    content = readFileSync(filepath, 'utf-8');
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw err;
  }

  const { frontmatter, body } = parseFrontmatter(content);

  const ctx = createRenderContext();
  const toc = preWalkForToc(ctx.marked, body);

  const lineOffset = frontmatter
    ? content.slice(0, content.replace(/\r\n/g, '\n').indexOf(body)).split(/\r?\n/).length
    : 1;

  ctx.lineMapping.reset(body, lineOffset);
  const renderedHtml = ctx.marked.parse(body) as string;

  return { html: renderedHtml, toc, frontmatter, filePath: filepath };
}

export function renderFrontmatter(
  frontmatter: Record<string, string | boolean> | null,
): string {
  if (!frontmatter || Object.keys(frontmatter).length === 0) return '';

  const items = Object.entries(frontmatter)
    .map(([key, value]) => {
      let displayValue: string;
      if (typeof value === 'boolean') {
        displayValue = value
          ? `<span class="fm-bool fm-true">true</span>`
          : `<span class="fm-bool fm-false">false</span>`;
      } else if (value.includes(',')) {
        const tags = value
          .split(',')
          .map((v) => html`<code class="fm-code">${v.trim()}</code>`)
          .join('');
        displayValue = `<div class="fm-tags">${tags}</div>`;
      } else {
        displayValue = html`<span class="fm-value">${value}</span>`;
      }
      return html`<div class="fm-item"><span class="fm-key">${key}</span>${raw(displayValue)}</div>`;
    })
    .join('');

  return `<div class="frontmatter">${items}</div>`;
}
