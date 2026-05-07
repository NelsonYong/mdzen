import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ProposalRegistry } from './proposals.ts';

test('proposals: store + retrieve', () => {
  const r = new ProposalRegistry({ ttlMs: 60_000 });
  const id = r.create(
    { sessionId: 's1', path: 'a.md', oldText: 'a', newText: 'b', reason: 'fix' },
    0,
  );
  const p = r.get(id, 100);
  assert.equal(p?.path, 'a.md');
  assert.equal(p?.newText, 'b');
});

test('proposals: expired returns null', () => {
  const r = new ProposalRegistry({ ttlMs: 1000 });
  const id = r.create(
    { sessionId: 's1', path: 'a.md', oldText: 'a', newText: 'b', reason: 'fix' },
    0,
  );
  assert.equal(r.get(id, 2000), null);
});

test('proposals: consume removes', () => {
  const r = new ProposalRegistry({ ttlMs: 60_000 });
  const id = r.create(
    { sessionId: 's1', path: 'a.md', oldText: 'a', newText: 'b', reason: 'fix' },
    0,
  );
  assert.ok(r.consume(id, 100));
  assert.equal(r.get(id, 200), null);
});
