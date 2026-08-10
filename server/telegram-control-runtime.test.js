const test = require('node:test');
const assert = require('node:assert/strict');
const { parseTelegramCommand, isRoleAllowed } = require('./telegram-control-runtime');

test('maps Telegram commands to publishing operations', () => {
  assert.equal(parseTelegramCommand('/status').command, 'publishing.health');
  assert.equal(parseTelegramCommand('/pause').command, 'publishing.scheduler.pause');
  assert.equal(parseTelegramCommand('/resume').command, 'publishing.scheduler.resume');
  assert.equal(parseTelegramCommand('/unknown'), null);
});

test('enforces role boundary', () => {
  assert.equal(isRoleAllowed('viewer', 'publishing.health'), true);
  assert.equal(isRoleAllowed('viewer', 'publishing.scheduler.pause'), false);
  assert.equal(isRoleAllowed('operator', 'publishing.scheduler.pause'), false);
  assert.equal(isRoleAllowed('admin', 'publishing.scheduler.pause'), true);
  assert.equal(isRoleAllowed('owner', 'publishing.scheduler.resume'), true);
});
