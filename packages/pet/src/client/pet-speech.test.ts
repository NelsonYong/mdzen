import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripThinkBlocks } from './pet-speech.ts';

test('strip: complete think block removed', () => {
  assert.equal(stripThinkBlocks('<think>reasoning</think>hello'), 'hello');
});

test('strip: hides text after unclosed think tag', () => {
  assert.equal(stripThinkBlocks('hi <think>still thinking'), 'hi');
});

test('strip: multiple think blocks', () => {
  assert.equal(
    stripThinkBlocks('<think>a</think>part1<think>b</think>part2'),
    'part1part2',
  );
});

test('strip: no think tag returns trimmed', () => {
  assert.equal(stripThinkBlocks('  hello  '), 'hello');
});

test('strip: only unclosed think yields empty', () => {
  assert.equal(stripThinkBlocks('<think>nothing closed yet'), '');
});
