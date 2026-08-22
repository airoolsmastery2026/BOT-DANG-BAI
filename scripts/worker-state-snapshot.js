'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const FILES = [
  ['queue', 'DHP_PUBLISHING_WORKER_PATH', './server/dhp-publishing-worker.json'],
  ['vault', 'DHP_PUBLISHING_VAULT_PATH', './server/dhp-publishing-vault.json'],
  ['control', 'DHP_PUBLISHING_CONTROL_PATH', './server/dhp-publishing-control.json'],
];

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const resolveTargets = (env = process.env, cwd = process.cwd()) => FILES.map(([name, key, fallback]) => ({
  name,
  path: path.resolve(cwd, String(env[key] || fallback)),
}));

const atomicWrite = (target, data) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, data, { mode: 0o600 });
  fs.renameSync(temp, target);
};

function createSnapshot({ outDir, env = process.env, cwd = process.cwd() }) {
  if (!outDir) throw new Error('Snapshot output directory is required.');
  const snapshotDir = path.resolve(cwd, outDir);
  fs.mkdirSync(snapshotDir, { recursive: true, mode: 0o700 });
  const files = [];
  for (const target of resolveTargets(env, cwd)) {
    if (!fs.existsSync(target.path)) continue;
    const data = fs.readFileSync(target.path);
    const filename = `${target.name}.json`;
    fs.writeFileSync(path.join(snapshotDir, filename), data, { mode: 0o600 });
    files.push({ name: target.name, filename, bytes: data.length, sha256: sha256(data) });
  }
  if (!files.length) throw new Error('No worker state files found to back up.');
  const manifest = { schemaVersion: '1.0', createdAt: new Date().toISOString(), files };
  fs.writeFileSync(path.join(snapshotDir, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  return { snapshotDir, manifest };
}

function verifySnapshot(snapshotDir) {
  const dir = path.resolve(snapshotDir);
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const results = manifest.files.map((entry) => {
    const file = path.join(dir, entry.filename);
    const data = fs.readFileSync(file);
    return { name: entry.name, ok: data.length === entry.bytes && sha256(data) === entry.sha256 };
  });
  return { ok: results.every((item) => item.ok), results, manifest };
}

function restoreSnapshot({ snapshotDir, confirmation, env = process.env, cwd = process.cwd() }) {
  if (confirmation !== 'RESTORE_DHP_STATE') throw new Error('Explicit restore confirmation is required.');
  const verified = verifySnapshot(snapshotDir);
  if (!verified.ok) throw new Error('Snapshot integrity verification failed.');
  const targets = new Map(resolveTargets(env, cwd).map((item) => [item.name, item.path]));
  for (const entry of verified.manifest.files) {
    const target = targets.get(entry.name);
    if (!target) throw new Error(`Unknown snapshot entry: ${entry.name}`);
    const source = path.join(path.resolve(snapshotDir), entry.filename);
    atomicWrite(target, fs.readFileSync(source));
  }
  return { restored: verified.manifest.files.map((entry) => entry.name) };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const value = (prefix) => args.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  try {
    if (args.includes('backup')) {
      const outDir = value('--out=') || `./backups/dhp-worker-${Date.now()}`;
      const result = createSnapshot({ outDir });
      console.log(`Snapshot created: ${result.snapshotDir}`);
      console.log(`Files: ${result.manifest.files.map((item) => item.name).join(', ')}`);
    } else if (args.includes('verify')) {
      const dir = value('--dir=');
      const result = verifySnapshot(dir);
      console.log(`Snapshot integrity: ${result.ok ? 'PASS' : 'FAIL'}`);
      process.exitCode = result.ok ? 0 : 2;
    } else if (args.includes('restore')) {
      const dir = value('--dir=');
      const confirm = value('--confirm=');
      const result = restoreSnapshot({ snapshotDir: dir, confirmation: confirm });
      console.log(`Restored: ${result.restored.join(', ')}`);
    } else {
      throw new Error('Use backup, verify, or restore.');
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}

module.exports = { createSnapshot, resolveTargets, restoreSnapshot, verifySnapshot };
