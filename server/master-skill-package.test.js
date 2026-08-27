'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const skillRoot = path.join(root, 'skills', 'dhp-master-content-system');
const read = (relativePath) => fs.readFileSync(path.join(skillRoot, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));

test('master skill package has valid triggering frontmatter and concise workflow instructions', () => {
  const skill = read('SKILL.md');
  assert.match(skill, /^---\r?\nname: dhp-master-content-system\r?\ndescription: .+\r?\n---/);
  assert.match(skill, /evidence gates/i);
  assert.match(skill, /human approval/i);
  assert.ok(skill.split(/\r?\n/).length < 120);
});

test('master skill package exposes UI metadata and valid schemas', () => {
  const openai = read(path.join('agents', 'openai.yaml'));
  assert.match(openai, /display_name: "DHP Master Content System"/);
  assert.match(openai, /\$dhp-master-content-system/);
  const input = readJson('input.schema.json');
  const output = readJson('output.schema.json');
  assert.deepEqual(input.required, ['stageId', 'payload']);
  assert.deepEqual(output.required, ['stageId', 'masterSkill', 'instruction']);
});

test('master skill metadata and registry agree on version, entrypoint and capabilities', () => {
  const metadata = readJson('metadata.json');
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'skills', 'registry.json'), 'utf8'));
  const registration = registry.skills.find((skill) => skill.id === metadata.id);
  assert.ok(registration);
  assert.equal(registration.version, metadata.version);
  assert.equal(registration.runtimeEntrypoint, metadata.entrypoint);
  metadata.dependencies.forEach((dependency) => assert.ok(registry.capabilities.includes(dependency)));
  assert.ok(fs.existsSync(path.join(root, metadata.entrypoint)));
});
