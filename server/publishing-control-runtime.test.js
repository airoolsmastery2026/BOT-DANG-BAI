const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createPublishingControlRuntime } = require('./publishing-control-runtime');

test('publishing runtime persists pause/resume state without creating a second queue', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhp-publishing-control-'));
  const statePath = path.join(dir, 'state.json');
  const runtime = createPublishingControlRuntime({ statePath });

  assert.equal(runtime.getState().paused, false);
  const paused = runtime.pause({ actor: 'telegram-control', commandId: 'cmd-1' });
  assert.equal(paused.paused, true);
  assert.equal(paused.lastCommandId, 'cmd-1');

  const reloaded = createPublishingControlRuntime({ statePath });
  assert.equal(reloaded.getState().paused, true);

  const resumed = reloaded.resume({ actor: 'telegram-control', commandId: 'cmd-2' });
  assert.equal(resumed.paused, false);
  assert.equal(resumed.lastCommandId, 'cmd-2');
});

test('runtime fails closed and preserves an invalid control-state file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhp-publishing-control-'));
  const statePath = path.join(dir, 'state.json');
  fs.writeFileSync(statePath, '{bad json', 'utf8');
  const runtime = createPublishingControlRuntime({ statePath });

  assert.throws(() => runtime.getState(), (error) => error.code === 'CONTROL_STATE_CORRUPT');
  assert.throws(() => runtime.resume({ commandId: 'cmd-recover' }), (error) => error.code === 'CONTROL_STATE_CORRUPT');
  assert.equal(fs.readFileSync(statePath, 'utf8'), '{bad json');
});

test('runtime rejects a parseable state without an explicit paused boolean', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhp-publishing-control-'));
  const statePath = path.join(dir, 'state.json');
  fs.writeFileSync(statePath, JSON.stringify({ updatedAt: new Date().toISOString() }), 'utf8');
  const runtime = createPublishingControlRuntime({ statePath });

  assert.throws(() => runtime.getState(), (error) => error.code === 'CONTROL_STATE_CORRUPT');
});
