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

test('runtime state is bounded and fail-safe on invalid files', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'dhp-publishing-control-'));
  const statePath = path.join(dir, 'state.json');
  fs.writeFileSync(statePath, '{bad json', 'utf8');
  const runtime = createPublishingControlRuntime({ statePath });
  assert.deepEqual(runtime.getState(), {
    paused: false,
    updatedAt: null,
    updatedBy: null,
    lastCommandId: null,
  });
});
