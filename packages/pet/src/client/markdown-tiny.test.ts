import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderMarkdownTiny } from './markdown-tiny.ts';

test('md: escapes raw html', () => {
  const out = renderMarkdownTiny('<script>alert(1)</script>');
  assert.ok(!out.includes('<script>'));
  assert.ok(out.includes('&lt;script&gt;'));
});

test('md: bold + inline code', () => {
  const out = renderMarkdownTiny('hello **world** with `code`');
  assert.match(out, /<strong>world<\/strong>/);
  assert.match(out, /<code class="mdzen-md-ic">code<\/code>/);
});

test('md: heading', () => {
  const out = renderMarkdownTiny('## Title');
  assert.match(out, /<h2[^>]*>Title<\/h2>/);
});

test('md: blockquote', () => {
  const out = renderMarkdownTiny('> quoted');
  assert.match(out, /<blockquote/);
  assert.match(out, /quoted/);
});

test('md: unordered list', () => {
  const out = renderMarkdownTiny('- one\n- two');
  assert.match(out, /<ul/);
  assert.match(out, /<li>one<\/li>/);
  assert.match(out, /<li>two<\/li>/);
});

test('md: hr', () => {
  const out = renderMarkdownTiny('---');
  assert.match(out, /<hr>/);
});

test('md: code block fence', () => {
  const out = renderMarkdownTiny('```js\nconst a = 1;\n```');
  assert.match(out, /<pre class="mdzen-md-code">/);
  assert.match(out, /const a = 1;/);
});
