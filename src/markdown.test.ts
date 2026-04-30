import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import { parseFrontmatter, extractToc, generateUniqueId, renderFrontmatter } from './markdown.ts';

describe('parseFrontmatter', () => {
  it('returns null frontmatter when none is present', () => {
    const r = parseFrontmatter('# hello');
    assert.equal(r.frontmatter, null);
    assert.equal(r.body, '# hello');
  });

  it('parses simple key/value pairs', () => {
    const r = parseFrontmatter('---\ntitle: Hello\nauthor: Jay\n---\n# body');
    assert.deepEqual(r.frontmatter, { title: 'Hello', author: 'Jay' });
    assert.equal(r.body, '# body');
  });

  it('coerces true/false to booleans', () => {
    const r = parseFrontmatter('---\ndraft: true\npublic: false\n---\n');
    assert.equal(r.frontmatter?.['draft'], true);
    assert.equal(r.frontmatter?.['public'], false);
  });

  it('strips matching surrounding quotes', () => {
    const r = parseFrontmatter(`---\nname: "quoted"\nalt: 'single'\n---\n`);
    assert.equal(r.frontmatter?.['name'], 'quoted');
    assert.equal(r.frontmatter?.['alt'], 'single');
  });

  it('handles CRLF line endings (Windows-authored files)', () => {
    const r = parseFrontmatter('---\r\ntitle: cr\r\n---\r\n# body');
    assert.deepEqual(r.frontmatter, { title: 'cr' });
    assert.equal(r.body, '# body');
  });

  it('treats malformed (no closing) frontmatter as no frontmatter', () => {
    const r = parseFrontmatter('---\ntitle: oops\n# body');
    assert.equal(r.frontmatter, null);
  });
});

describe('extractToc', () => {
  it('lists h1-h4 headings only', () => {
    const md = '# A\n## B\n### C\n#### D\n##### E';
    const toc = extractToc(md);
    assert.deepEqual(
      toc.map((t) => [t.level, t.text]),
      [
        [1, 'A'],
        [2, 'B'],
        [3, 'C'],
        [4, 'D'],
      ],
    );
  });

  it('skips headings inside fenced code blocks', () => {
    const md = '# Real\n\n```\n# Fake\n```\n';
    const toc = extractToc(md);
    assert.equal(toc.length, 1);
    assert.equal(toc[0]?.text, 'Real');
  });

  it('produces unique IDs even for duplicate heading text', () => {
    const md = '# Same\n# Same\n# Same';
    const toc = extractToc(md);
    assert.deepEqual(
      toc.map((t) => t.id),
      ['same', 'same-1', 'same-2'],
    );
  });

  it('handles unicode (CJK) heading text', () => {
    const toc = extractToc('# 中文标题');
    assert.equal(toc[0]?.id, '中文标题');
  });
});

describe('generateUniqueId', () => {
  it('strips HTML tags from heading text', () => {
    const ids = new Set<string>();
    assert.equal(generateUniqueId('<em>hello</em> world', ids), 'hello-world');
  });

  it('disambiguates collisions deterministically', () => {
    const ids = new Set<string>();
    assert.equal(generateUniqueId('foo', ids), 'foo');
    assert.equal(generateUniqueId('foo', ids), 'foo-1');
    assert.equal(generateUniqueId('foo', ids), 'foo-2');
  });
});

describe('renderFrontmatter', () => {
  it('returns empty string for null/empty frontmatter', () => {
    assert.equal(renderFrontmatter(null), '');
    assert.equal(renderFrontmatter({}), '');
  });

  it('escapes HTML-injection attempts in keys and values', () => {
    const out = renderFrontmatter({ '<key>': '<value>' });
    assert.ok(!out.includes('<key>'));
    assert.ok(!out.includes('<value>'));
    assert.ok(out.includes('&lt;key&gt;'));
    assert.ok(out.includes('&lt;value&gt;'));
  });

  it('renders booleans as styled badges', () => {
    const t = renderFrontmatter({ draft: true });
    const f = renderFrontmatter({ draft: false });
    assert.ok(t.includes('fm-true'));
    assert.ok(f.includes('fm-false'));
  });

  it('splits comma-separated tags', () => {
    const out = renderFrontmatter({ tags: 'a, b, c' });
    assert.ok(out.includes('fm-tags'));
    assert.equal((out.match(/fm-code/g) ?? []).length, 3);
  });
});
