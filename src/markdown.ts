import { marked } from 'marked';
import { markedHighlight } from 'marked-highlight';
import hljs from 'highlight.js';
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { DOC_ROOT } from './config.ts';
import type { TocItem, MarkdownResult } from './types.ts';
import { resetBlockLineQueue, consumeLineAttr } from './line-mapping.ts';

type AdmonitionType = 'info' | 'tip' | 'warning' | 'danger' | 'caution' | 'note';

interface AdmonitionStyle {
  border: string;
  titleBg: string;
  titleColor: string;
  bg: string;
  label: string;
}

const ADMONITION_STYLES: Record<AdmonitionType, AdmonitionStyle> = {
  info:    { border: '#3b82f6', titleBg: '#dbeafe', titleColor: '#1d4ed8', bg: '#eff6ff', label: 'INFO' },
  tip:     { border: '#22c55e', titleBg: '#dcfce7', titleColor: '#15803d', bg: '#f0fdf4', label: 'TIP' },
  warning: { border: '#f59e0b', titleBg: '#fef3c7', titleColor: '#b45309', bg: '#fffbeb', label: 'WARNING' },
  danger:  { border: '#ef4444', titleBg: '#fee2e2', titleColor: '#b91c1c', bg: '#fef2f2', label: 'DANGER' },
  caution: { border: '#f97316', titleBg: '#ffedd5', titleColor: '#c2410c', bg: '#fff7ed', label: 'CAUTION' },
  note:    { border: '#a855f7', titleBg: '#f3e8ff', titleColor: '#7e22ce', bg: '#faf5ff', label: 'NOTE' },
};

// Module-level state reset before each render pass to produce consistent heading IDs
let currentUsedIds = new Set<string>();

export function generateUniqueId(text: string, usedIds: Set<string>): string {
  const baseId = text
    .toLowerCase()
    .replace(/<[^>]*>/g, '')
    .replace(/[^\w\u4e00-\u9fa5]+/g, '-')
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

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Syntax highlighting via highlight.js (walkTokens pre-highlights code tokens)
marked.use(
  markedHighlight({
    emptyLangClass: 'hljs',
    langPrefix: 'hljs language-',
    highlight(code: string, lang: string): string {
      if (lang && hljs.getLanguage(lang)) {
        try {
          return hljs.highlight(code, { language: lang }).value;
        } catch {
          // fall through to auto-detect
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

// Block-level renderers that inject data-source-line for editor linking.
// The consumeLineAttr() call only succeeds when the queue front matches the
// token type, so nested elements (rendered before their parent) naturally skip.
marked.use({
  renderer: {
    heading(this: any, token: any): string {
      const id = generateUniqueId(token.text, currentUsedIds);
      const lineAttr = consumeLineAttr('heading');
      return `<h${token.depth}${lineAttr} id="${id}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
    },
    paragraph(this: any, token: any): string {
      const lineAttr = consumeLineAttr('paragraph');
      return `<p${lineAttr}>${this.parser.parseInline(token.tokens)}</p>\n`;
    },
    code(this: any, token: any): string {
      const lineAttr = consumeLineAttr('code');
      const lang = (token.lang || '').match(/^\S*/)?.[0] || '';
      const langClass = lang ? `hljs language-${lang}` : 'hljs';
      const text = token.text.replace(/\n$/, '') + '\n';
      // token.text is pre-highlighted by markedHighlight's walkTokens; escaped=true
      const code = token.escaped ? text : escapeHtml(text);
      return `<pre${lineAttr}><code class="${langClass}">${code}</code></pre>\n`;
    },
    blockquote(this: any, token: any): string {
      const lineAttr = consumeLineAttr('blockquote');
      const body = this.parser.parse(token.tokens);
      return `<blockquote${lineAttr}>\n${body}</blockquote>\n`;
    },
    list(this: any, token: any): string {
      const lineAttr = consumeLineAttr('list');
      const tag = token.ordered ? 'ol' : 'ul';
      const startAttr = token.ordered && token.start !== 1 ? ` start="${token.start}"` : '';
      let body = '';
      for (const item of token.items) {
        body += this.listitem(item);
      }
      return `<${tag}${startAttr}${lineAttr}>\n${body}</${tag}>\n`;
    },
    table(this: any, token: any): string {
      const lineAttr = consumeLineAttr('table');
      // Render header cells
      let headerCells = '';
      for (const cell of token.header) {
        headerCells += this.tablecell(cell);
      }
      const header = this.tablerow({ text: headerCells });
      // Render body rows
      let body = '';
      for (const row of token.rows) {
        let rowCells = '';
        for (const cell of row) {
          rowCells += this.tablecell(cell);
        }
        body += this.tablerow({ text: rowCells });
      }
      if (body) body = `<tbody>${body}</tbody>`;
      return `<table${lineAttr}>\n<thead>\n${header}</thead>\n${body}</table>\n`;
    },
    hr(): string {
      const lineAttr = consumeLineAttr('hr');
      return `<hr${lineAttr}>\n`;
    },
    html(token: any): string {
      // Raw HTML blocks: consume queue entry to stay in sync, but don't inject
      consumeLineAttr('html');
      return token.text;
    },
  },
});

// Admonition block extension: :::type [title]\ncontent\n:::
marked.use({
  extensions: [
    {
      name: 'admonition',
      level: 'block' as const,
      start(src: string): number {
        return src.indexOf(':::');
      },
      tokenizer(this: any, src: string): any {
        const rule = /^:::(info|tip|warning|danger|caution|note)([ \t]+[^\n]*)?\n([\s\S]*?)\n:::/;
        const match = rule.exec(src);
        if (match) {
          return {
            type: 'admonition',
            raw: match[0],
            admonitionType: match[1],
            title: match[2] ? match[2].trim() : '',
            tokens: this.lexer.blockTokens(match[3] ?? ''),
          };
        }
      },
      renderer(this: any, token: any): string {
        const lineAttr = consumeLineAttr('admonition');
        const style =
          ADMONITION_STYLES[token.admonitionType as AdmonitionType] ?? ADMONITION_STYLES.info;
        const title = (token.title as string) || style.label;
        const content = this.parser.parse(token.tokens) as string;
        return (
          `<div class="admonition admonition-${token.admonitionType}"${lineAttr}>` +
          `<div class="admonition-title">${title}</div>` +
          `<div class="admonition-content">${content}</div>` +
          `</div>\n`
        );
      },
    },
  ],
});

export function parseFrontmatter(content: string): {
  frontmatter: Record<string, string | boolean> | null;
  body: string;
} {
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!match) return { frontmatter: null, body: content };

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

export function extractToc(markdown: string): TocItem[] {
  const toc: TocItem[] = [];
  const usedIds = new Set<string>();
  let inCodeBlock = false;

  for (const line of markdown.split('\n')) {
    if (line.trim().startsWith('```')) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const match = line.match(/^(#{1,4})\s+(.+)$/);
    if (match) {
      toc.push({
        level: match[1]!.length,
        text: match[2]!.trim(),
        id: generateUniqueId(match[2]!.trim(), usedIds),
      });
    }
  }

  return toc;
}

export function renderToc(toc: TocItem[]): string {
  if (toc.length === 0) return '<div class="toc-empty">暂无目录</div>';

  const minLevel = Math.min(...toc.map((item) => item.level));
  return toc
    .map((item) => {
      const relativeLevel = item.level - minLevel;
      return (
        `<a href="#${item.id}" class="toc-item toc-level-${item.level}" ` +
        `data-level="${relativeLevel}">${item.text}</a>`
      );
    })
    .join('\n');
}

export function getMarkdownWithToc(filename: string): MarkdownResult | null {
  const filepath = join(DOC_ROOT, filename);
  if (!existsSync(filepath)) return null;

  const content = readFileSync(filepath, 'utf-8');
  const { frontmatter, body } = parseFrontmatter(content);
  const toc = extractToc(body);

  // Calculate line offset: if frontmatter exists, body starts after '---\n...\n---\n'
  const lineOffset = frontmatter
    ? content.slice(0, content.indexOf(body)).split('\n').length
    : 1;

  // Reset per-render state
  currentUsedIds = new Set<string>();
  resetBlockLineQueue(body, lineOffset);

  const html = marked.parse(body) as string;

  return { html, toc, frontmatter, filePath: resolve(filepath) };
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
          ? '<span class="fm-bool fm-true">true</span>'
          : '<span class="fm-bool fm-false">false</span>';
      } else if (value.includes(',')) {
        const tags = value
          .split(',')
          .map((v) => `<code class="fm-code">${v.trim()}</code>`)
          .join('');
        displayValue = `<div class="fm-tags">${tags}</div>`;
      } else {
        displayValue = `<span class="fm-value">${value}</span>`;
      }
      return `<div class="fm-item"><span class="fm-key">${key}</span>${displayValue}</div>`;
    })
    .join('');

  return `<div class="frontmatter">${items}</div>`;
}
