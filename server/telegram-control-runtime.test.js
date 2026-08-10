'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  buildCommandId,
  isPrivateChat,
  isRoleAllowed,
  parseOperatorMap,
  parseTelegramCommand,
} = require('./telegram-control-runtime');

test('maps only supported Telegram commands to publishing operations', () => {
  assert.equal(parseTelegramCommand('/status').command, 'publishing.health');
  assert.equal(parseTelegramCommand('/pause@DhpBot').command, 'publishing.scheduler.pause');
  assert.equal(parseTelegramCommand('/resume now').command, 'publishing.scheduler.resume');
  assert.equal(parseTelegramCommand('/publish'), null);
  assert.equal(parseTelegramCommand('/delete'), null);
  assert.equal(parseTelegramCommand('/unknown'), null);
});

test('enforces least-privilege role boundary', () => {
  assert.equal(isRoleAllowed('viewer', 'publishing.health'), true);
  assert.equal(isRoleAllowed('viewer', 'publishing.scheduler.pause'), false);
  assert.equal(isRoleAllowed('operator', 'publishing.scheduler.pause'), false);
  assert.equal(isRoleAllowed('admin', 'publishing.scheduler.pause'), true);
  assert.equal(isRoleAllowed('owner', 'publishing.scheduler.resume'), true);
  assert.equal(isRoleAllowed('unknown', 'publishing.health'), false);
});

test('parses explicit numeric operator allowlist only', () => {
  const operators = parseOperatorMap('123:owner, 456:viewer, abc:admin, 789:invalid');
  assert.equal(operators.get('123'), 'owner');
  assert.equal(operators.get('456'), 'viewer');
  assert.equal(operators.has('abc'), false);
  assert.equal(operators.has('789'), false);
});

test('defaults control channel to private Telegram chat', () => {
  assert.equal(isPrivateChat({ chat: { type: 'private' } }), true);
  assert.equal(isPrivateChat({ chat: { type: 'group' } }), false);
  assert.equal(isPrivateChat({ chat: { type: 'supergroup' } }), false);
});

test('builds stable idempotency key from Telegram update id', () => {
  assert.equal(buildCommandId({ update_id: 123 }), 'tg-123');
  assert.equal(buildCommandId({ update_id: -1 }), null);
  assert.equal(buildCommandId({}), null);
});
