import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  escapeHtml,
  html,
  raw,
  safeJsonForScript,
  safeResolve,
  decodeUrlPath,
  PathTraversalError,
} from './security.ts';

describe('escapeHtml', () => {
  it('escapes the five HTML-significant characters', () => {
    assert.equal(
      escapeHtml(`<script>alert("x"&'y')</script>`),
      '&lt;script&gt;alert(&quot;x&quot;&amp;&#39;y&#39;)&lt;/script&gt;',
    );
  });

  it('returns the input unchanged when no special chars are present', () => {
    assert.equal(escapeHtml('hello world 你好'), 'hello world 你好');
  });
});

describe('html tag', () => {
  it('auto-escapes interpolated strings', () => {
    const name = '<img src=x onerror=alert(1)>.md';
    assert.equal(
      html`<a>${name}</a>`,
      '<a>&lt;img src=x onerror=alert(1)&gt;.md</a>',
    );
  });

  it('preserves raw() content unescaped', () => {
    assert.equal(html`<div>${raw('<b>bold</b>')}</div>`, '<div><b>bold</b></div>');
  });

  it('flattens arrays and escapes each element', () => {
    const items = ['<a>', '<b>'];
    assert.equal(html`<ul>${items.map((x) => html`<li>${x}</li>`).map(raw)}</ul>`, '<ul><li>&lt;a&gt;</li><li>&lt;b&gt;</li></ul>');
  });

  it('renders numbers and skips null/undefined/false', () => {
    assert.equal(html`<x>${1}${null}${undefined}${false}${'a'}</x>`, '<x>1a</x>');
  });
});

describe('safeJsonForScript', () => {
  it('escapes </script> sequence to defeat <script> tag breakout', () => {
    const payload = { name: '</script><script>alert(1)</script>' };
    const out = safeJsonForScript(payload);
    assert.ok(!out.includes('</script>'), 'must not contain raw </script>');
    assert.ok(out.includes('\\u003c'), 'must contain escaped <');
    // Round-trip
    assert.deepEqual(JSON.parse(out), payload);
  });

  it('escapes line/paragraph separators that break JS string literals', () => {
    const out = safeJsonForScript({ x: '  ' });
    assert.ok(out.includes('\\u2028'));
    assert.ok(out.includes('\\u2029'));
  });
});

describe('safeResolve', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'mdzen-test-'));
  const root = realpathSync(tmp);
  writeFileSync(join(root, 'ok.md'), '# ok');
  mkdirSync(join(root, 'sub'));
  writeFileSync(join(root, 'sub', 'inner.md'), '# inner');

  it('resolves a normal relative path', () => {
    assert.equal(safeResolve(root, 'ok.md'), join(root, 'ok.md'));
  });

  it('throws on parent-directory traversal', () => {
    assert.throws(() => safeResolve(root, '../etc/passwd'), PathTraversalError);
    assert.throws(() => safeResolve(root, '../../../etc/passwd'), PathTraversalError);
  });

  it('throws on absolute paths outside root', () => {
    assert.throws(() => safeResolve(root, '/etc/passwd'), PathTraversalError);
  });

  it('returns resolved path even for non-existent files (caller handles ENOENT)', () => {
    const result = safeResolve(root, 'does-not-exist.md');
    assert.equal(result, join(root, 'does-not-exist.md'));
  });

  it('rejects symlink escape', () => {
    const linkRoot = realpathSync(mkdtempSync(join(tmpdir(), 'mdzen-link-')));
    const outside = realpathSync(mkdtempSync(join(tmpdir(), 'mdzen-out-')));
    writeFileSync(join(outside, 'secret'), 'secret');
    symlinkSync(join(outside, 'secret'), join(linkRoot, 'evil'));
    assert.throws(() => safeResolve(linkRoot, 'evil'), PathTraversalError);
  });

  it('strips null bytes', () => {
    // \0 in path would be interpreted by libc; safeResolve should clean
    const r = safeResolve(root, 'ok.md\0extra');
    assert.equal(r, join(root, 'ok.mdextra'));
  });
});

describe('decodeUrlPath', () => {
  it('decodes percent-encoded paths', () => {
    assert.equal(decodeUrlPath('/view/foo%20bar.md'), '/view/foo bar.md');
  });

  it('returns null for malformed encoding', () => {
    assert.equal(decodeUrlPath('/view/%E0%A4'), null);
  });

  it('rejects null-byte injection', () => {
    assert.equal(decodeUrlPath('/view/foo%00.md'), null);
  });
});
