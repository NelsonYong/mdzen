import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fallbackMoodAck } from './mood-ack.ts';

// runMoodAck itself is an LLM call — exercised end-to-end by the chat
// integration. Here we lock down the deterministic fallback that ships when
// the side-model is unavailable, since that's what production sees on
// flaky-network evenings.

test('fallbackMoodAck: hiding always refuses', () => {
  for (let i = 0; i < 10; i++) {
    const r = fallbackMoodAck('hiding', i / 10);
    assert.equal(r.willing, false);
    assert.ok(r.ack.length > 0);
  }
});

test('fallbackMoodAck: cold refuses by default', () => {
  const r = fallbackMoodAck('cold', 0);
  assert.equal(r.willing, false);
});

test('fallbackMoodAck: friendly answers', () => {
  const r = fallbackMoodAck('friendly', 0);
  assert.equal(r.willing, true);
});

test('fallbackMoodAck: adored answers', () => {
  const r = fallbackMoodAck('adored', 0);
  assert.equal(r.willing, true);
});

test('fallbackMoodAck: sulky answers (legible-but-cool tone)', () => {
  const r = fallbackMoodAck('sulky', 0);
  // sulky still engages — the willingness gate triggers at cold/hiding.
  assert.equal(r.willing, true);
  assert.ok(r.ack.length > 0);
});

test('fallbackMoodAck: ack pool covers full random range', () => {
  const seen = new Set<string>();
  for (let i = 0; i < 30; i++) {
    seen.add(fallbackMoodAck('adored', i / 30).ack);
  }
  // adored pool has 3 entries; 30 random samples should hit all 3.
  assert.ok(seen.size >= 2, `expected ≥2 distinct acks, got ${seen.size}`);
});
