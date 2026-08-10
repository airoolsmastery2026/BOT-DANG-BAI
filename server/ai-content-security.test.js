'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const serverSource = fs.readFileSync(path.join(__dirname, 'ai-content-server.js'), 'utf8');
const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
const schedulerSource = fs.readFileSync(path.join(root, 'src', 'PostScheduler.jsx'), 'utf8');
const clientSource = fs.readFileSync(path.join(root, 'src', 'ai_content_client.js'), 'utf8');

test('provider API key is consumed only by server-side AI gateway', () => {
  assert.match(serverSource, /process\.env\.GEMINI_API_KEY/);
  assert.match(serverSource, /'x-goog-api-key': GEMINI_API_KEY/);
  assert.doesNotMatch(schedulerSource, /useState\([^)]*(api[_-]?key|provider[_-]?key)/i);
  assert.doesNotMatch(schedulerSource, /type=["']password["'][^>]*(api|gemini|openai|anthropic)/i);
  assert.doesNotMatch(schedulerSource, /process\.env\.REACT_APP_(GEMINI|OPENAI|ANTHROPIC).*KEY/i);
  assert.doesNotMatch(clientSource, /process\.env\.REACT_APP_(GEMINI|OPENAI|ANTHROPIC).*KEY/i);
  assert.doesNotMatch(clientSource, /['"]x-goog-api-key['"]\s*:/i);
});

test('frontend environment contract never exposes provider secrets', () => {
  assert.match(envExample, /^GEMINI_API_KEY=/m);
  assert.match(envExample, /^REACT_APP_DHP_AI_CONTENT_URL=/m);
  assert.doesNotMatch(envExample, /^REACT_APP_(GEMINI|OPENAI|ANTHROPIC).*KEY=/m);
});

test('AI gateway defaults to loopback and explicit origin', () => {
  assert.match(serverSource, /DHP_AI_CONTENT_HOST \|\| '127\.0\.0\.1'/);
  assert.match(serverSource, /DHP_AI_CONTENT_ORIGIN \|\| 'http:\/\/localhost:3000'/);
});
