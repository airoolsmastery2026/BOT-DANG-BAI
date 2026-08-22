'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createSnapshot, restoreSnapshot, verifySnapshot } = require('./worker-state-snapshot');

const makeFixture = () => {
  const cwd = fs.mkdtempSync(path.join(os.tmpdir(), 'dhp-state-'));
  const env = {
    DHP_PUBLISHING_WORKER_PATH: './state/queue.json',
    DHP_PUBLISHING_VAULT_PATH: './state/vault.json',
    DHP_PUBLISHING_CONTROL_PATH: './state/control.json',
  };
  fs.mkdirSync(path.join(cwd, 'state'), { recursive: true });
  fs.writeFileSync(path.join(cwd, 'state/queue.json'), '{"jobs":[1]}');
  fs.writeFileSync(path.join(cwd, 'state/vault.json'), 'encrypted-vault-ciphertext');
  fs.writeFileSync(path.join(cwd, 'state/control.json'), '{"paused":true}');
  return { cwd, env };
};

test('backup manifest contains hashes and sizes but not state contents', () => {
  const { cwd, env } = makeFixture();
  const result = createSnapshot({ outDir: './backup', env, cwd });
  assert.equal(result.manifest.files.length, 3);
  const manifestText = fs.readFileSync(path.join(cwd, 'backup/manifest.json'), 'utf8');
  assert.doesNotMatch(manifestText, /encrypted-vault-ciphertext/);
  assert.match(manifestText, /sha256/);
});

test('verify detects snapshot corruption', () => {
  const { cwd, env } = makeFixture();
  createSnapshot({ outDir: './backup', env, cwd });
  fs.appendFileSync(path.join(cwd, 'backup/queue.json'), 'tampered');
  const result = verifySnapshot(path.join(cwd, 'backup'));
  assert.equal(result.ok, false);
  assert.equal(result.results.find((item) => item.name === 'queue').ok, false);
});

test('restore requires explicit confirmation and roundtrips all state files', () => {
  const { cwd, env } = makeFixture();
  createSnapshot({ outDir: './backup', env, cwd });
  fs.writeFileSync(path.join(cwd, 'state/queue.json'), '{"jobs":[]}');
  fs.writeFileSync(path.join(cwd, 'state/vault.json'), 'changed');
  fs.writeFileSync(path.join(cwd, 'state/control.json'), '{"paused":false}');

  assert.throws(() => restoreSnapshot({ snapshotDir: path.join(cwd, 'backup'), env, cwd }), /confirmation/);
  const restored = restoreSnapshot({
    snapshotDir: path.join(cwd, 'backup'),
    confirmation: 'RESTORE_DHP_STATE',
    env,
    cwd,
  });
  assert.deepEqual(restored.restored.sort(), ['control', 'queue', 'vault']);
  assert.equal(fs.readFileSync(path.join(cwd, 'state/queue.json'), 'utf8'), '{"jobs":[1]}');
  assert.equal(fs.readFileSync(path.join(cwd, 'state/vault.json'), 'utf8'), 'encrypted-vault-ciphertext');
  assert.equal(fs.readFileSync(path.join(cwd, 'state/control.json'), 'utf8'), '{"paused":true}');
});
