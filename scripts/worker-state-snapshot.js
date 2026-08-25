'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const FILES = [
  ['queue', 'DHP_PUBLISHING_WORKER_PATH', './server/dhp-publishing-worker.json'],
  ['vault', 'DHP_PUBLISHING_VAULT_PATH', './server/dhp-publishing-vault.json'],
  ['control', 'DHP_PUBLISHING_CONTROL_PATH', './server/dhp-publishing-control.json'],
];
const SNAPSHOT_FILES = new Map(FILES.map(([name]) => [name, `${name}.json`]));
const SHA256_PATTERN = /^[a-f0-9]{64}$/;

const sha256 = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const resolveTargets = (env = process.env, cwd = process.cwd()) => FILES.map(([name, key, fallback]) => ({
  name,
  path: path.resolve(cwd, String(env[key] || fallback)),
}));

const atomicWrite = (target, data) => {
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const temp = `${target}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(temp, data, { mode: 0o600 });
    fs.renameSync(temp, target);
  } catch (error) {
    try {
      fs.rmSync(temp, { force: true });
    } catch {
      // Preserve the original write failure.
    }
    throw error;
  }
};

const readManifest = (snapshotDir) => {
  const dir = path.resolve(snapshotDir || '');
  const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  if (!manifest || manifest.schemaVersion !== '1.0' || !Array.isArray(manifest.files) || !manifest.files.length) {
    throw new Error('Snapshot manifest is invalid or unsupported.');
  }
  if (manifest.files.length > SNAPSHOT_FILES.size) throw new Error('Snapshot manifest contains too many files.');

  const names = new Set();
  for (const entry of manifest.files) {
    const expectedFilename = entry && SNAPSHOT_FILES.get(entry.name);
    if (!expectedFilename) throw new Error(`Unknown snapshot entry: ${entry && entry.name}`);
    if (names.has(entry.name)) throw new Error(`Duplicate snapshot entry: ${entry.name}`);
    if (entry.filename !== expectedFilename) throw new Error(`Invalid snapshot filename for ${entry.name}.`);
    if (!Number.isSafeInteger(entry.bytes) || entry.bytes < 0) throw new Error(`Invalid snapshot size for ${entry.name}.`);
    if (typeof entry.sha256 !== 'string' || !SHA256_PATTERN.test(entry.sha256)) {
      throw new Error(`Invalid snapshot checksum for ${entry.name}.`);
    }
    names.add(entry.name);
  }
  return { dir, manifest };
};

function createSnapshot({ outDir, env = process.env, cwd = process.cwd() }) {
  if (!outDir) throw new Error('Snapshot output directory is required.');
  const snapshotDir = path.resolve(cwd, outDir);
  if (fs.existsSync(snapshotDir) && fs.readdirSync(snapshotDir).length) {
    throw new Error('Snapshot output directory must be empty.');
  }
  fs.mkdirSync(snapshotDir, { recursive: true, mode: 0o700 });
  const files = [];
  for (const target of resolveTargets(env, cwd)) {
    if (!fs.existsSync(target.path)) continue;
    if (!fs.lstatSync(target.path).isFile()) throw new Error(`Worker state is not a regular file: ${target.name}`);
    const data = fs.readFileSync(target.path);
    const filename = SNAPSHOT_FILES.get(target.name);
    atomicWrite(path.join(snapshotDir, filename), data);
    files.push({ name: target.name, filename, bytes: data.length, sha256: sha256(data) });
  }
  if (!files.length) throw new Error('No worker state files found to back up.');
  const manifest = { schemaVersion: '1.0', createdAt: new Date().toISOString(), files };
  atomicWrite(path.join(snapshotDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { snapshotDir, manifest };
}

function verifySnapshot(snapshotDir) {
  if (!snapshotDir) throw new Error('Snapshot directory is required.');
  const { dir, manifest } = readManifest(snapshotDir);
  const results = manifest.files.map((entry) => {
    const file = path.join(dir, entry.filename);
    const data = fs.readFileSync(file);
    return { name: entry.name, ok: data.length === entry.bytes && sha256(data) === entry.sha256 };
  });
  return { ok: results.every((item) => item.ok), results, manifest };
}

function restoreSnapshot({
  snapshotDir,
  confirmation,
  env = process.env,
  cwd = process.cwd(),
  atomicWriter = atomicWrite,
}) {
  if (confirmation !== 'RESTORE_DHP_STATE') throw new Error('Explicit restore confirmation is required.');
  const verified = verifySnapshot(snapshotDir);
  if (!verified.ok) throw new Error('Snapshot integrity verification failed.');
  const targets = new Map(resolveTargets(env, cwd).map((item) => [item.name, item.path]));
  const restorePlan = verified.manifest.files.map((entry) => {
    const target = targets.get(entry.name);
    if (!target) throw new Error(`Unknown snapshot entry: ${entry.name}`);
    const source = path.join(path.resolve(snapshotDir), entry.filename);
    return { name: entry.name, target, data: fs.readFileSync(source) };
  });
  if (new Set(restorePlan.map((item) => item.target)).size !== restorePlan.length) {
    throw new Error('Worker state targets must be distinct.');
  }

  const previous = restorePlan.map((item) => ({
    target: item.target,
    existed: fs.existsSync(item.target),
    data: fs.existsSync(item.target) ? fs.readFileSync(item.target) : null,
  }));
  let completed = 0;
  try {
    for (const item of restorePlan) {
      atomicWriter(item.target, item.data);
      completed += 1;
    }
  } catch (error) {
    const rollbackErrors = [];
    for (let index = completed - 1; index >= 0; index -= 1) {
      const item = previous[index];
      try {
        if (item.existed) atomicWriter(item.target, item.data);
        else fs.rmSync(item.target, { force: true });
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    if (rollbackErrors.length) {
      throw new AggregateError([error, ...rollbackErrors], 'State restore failed and rollback was incomplete.');
    }
    throw error;
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
