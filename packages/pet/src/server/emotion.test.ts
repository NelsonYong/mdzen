import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  affectionZone,
  applyEvent,
  tickRecovery,
  INITIAL_STATE,
  PRESET_PHRASES,
  applyPatientFollowUp,
  PATIENT_FOLLOWUP_DELTA,
  PATIENT_FOLLOWUP_WINDOW_MS,
  PATIENT_FOLLOWUP_MIN_GAP_MS,
} from './emotion.ts';

test('emotion: zone boundaries', () => {
  assert.equal(affectionZone(85), 'adored');
  assert.equal(affectionZone(50), 'friendly');
  assert.equal(affectionZone(25), 'sulky');
  assert.equal(affectionZone(10), 'cold');
  assert.equal(affectionZone(0), 'hiding');
});

test('emotion: applyEvent click adds affection and mood', () => {
  const s = INITIAL_STATE(0);
  const next = applyEvent(s, 'click', 1000);
  assert.equal(next.affection, 63);
  assert.equal(next.mood, 53);
});

test('emotion: applyEvent clamps to 0-100', () => {
  const s = { affection: 99, mood: 99, lastUpdated: 0 };
  const next = applyEvent(s, 'apply-diff', 1000);
  assert.equal(next.affection, 100);
  assert.equal(next.mood, 100);
});

test('emotion: applyEvent floors at 0', () => {
  const s = { affection: 1, mood: 1, lastUpdated: 0 };
  const next = applyEvent(s, 'drag-3plus', 1000);
  assert.equal(next.affection, 0);
  assert.equal(next.mood, 0);
});

test('emotion: tickRecovery pulls toward 50 mood and lifts affection', () => {
  const s = { affection: 50, mood: 30, lastUpdated: 0 };
  const next = tickRecovery(s, 10 * 60_000);
  assert.ok(next.affection > 50, `affection=${next.affection}`);
  assert.ok(next.mood > 30, `mood=${next.mood}`);
});

test('emotion: every zone has a non-empty preset phrase', () => {
  for (const z of ['adored', 'friendly', 'sulky', 'cold', 'hiding'] as const) {
    assert.ok(PRESET_PHRASES[z].length > 0, `zone ${z} phrase empty`);
  }
});

// ─── patient follow-up boost ───────────────────────────────────────────────

const NOW = 1_700_000_000_000;

test('applyPatientFollowUp: no-op when lastRefusalAt absent', () => {
  const s = INITIAL_STATE(NOW - 60_000);
  assert.equal(applyPatientFollowUp(s, NOW), s);
});

test('applyPatientFollowUp: spammy retry (<30s) gets no boost', () => {
  const s = { ...INITIAL_STATE(NOW - 60_000), lastRefusalAt: NOW - 5_000 };
  const out = applyPatientFollowUp(s, NOW);
  assert.equal(out, s, 'should return same reference when no boost applies');
});

test('applyPatientFollowUp: stale refusal (>10min) gets no boost', () => {
  const s = {
    ...INITIAL_STATE(NOW - 60_000),
    lastRefusalAt: NOW - PATIENT_FOLLOWUP_WINDOW_MS - 1_000,
  };
  assert.equal(applyPatientFollowUp(s, NOW), s);
});

test('applyPatientFollowUp: in-window patient retry adds delta', () => {
  const s = {
    affection: 12,
    mood: 20,
    lastUpdated: NOW - 60_000,
    lastRefusalAt: NOW - 90_000, // 90s ago — in window, past min gap
  };
  const out = applyPatientFollowUp(s, NOW);
  assert.equal(out.affection, 12 + PATIENT_FOLLOWUP_DELTA.affection);
  assert.equal(out.mood, 20 + PATIENT_FOLLOWUP_DELTA.mood);
});

test('applyPatientFollowUp: preserves lastRefusalAt so subsequent retries stack', () => {
  const refusedAt = NOW - 90_000;
  const s = { affection: 12, mood: 20, lastUpdated: NOW - 60_000, lastRefusalAt: refusedAt };
  const out = applyPatientFollowUp(s, NOW);
  assert.equal(out.lastRefusalAt, refusedAt);
});

test('applyPatientFollowUp: clamps to 100', () => {
  const s = {
    affection: 98,
    mood: 95,
    lastUpdated: NOW - 60_000,
    lastRefusalAt: NOW - 90_000,
  };
  const out = applyPatientFollowUp(s, NOW);
  assert.equal(out.affection, 100);
  assert.equal(out.mood, 100);
});

test('applyPatientFollowUp: exact min-gap boundary does not double-fire on next ms', () => {
  const justOverMin = NOW - PATIENT_FOLLOWUP_MIN_GAP_MS - 1;
  const s = { affection: 12, mood: 20, lastUpdated: NOW - 60_000, lastRefusalAt: justOverMin };
  const out = applyPatientFollowUp(s, NOW);
  // Just over the min gap — boost should fire.
  assert.notEqual(out, s);
});
