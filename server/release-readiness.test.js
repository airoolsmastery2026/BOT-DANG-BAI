'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const exists = (relativePath) => fs.existsSync(path.join(root, relativePath));
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const REQUIRED_FILES = [
  'src/PlatformConnections.jsx',
  'src/platform_credentials.js',
  'src/platform_connection_service.js',
  'src/meta_publishing_api.js',
  'src/tiktok_content_posting.js',
  'src/publisher_adapter.js',
  'src/publisher_preflight.js',
  'src/post_manager.js',
  'src/queue_runtime_lock.js',
  'src/queue_health.js',
  'src/campaign_media_prompt_engine.js',
  'src/campaign_audit_log.js',
  'src/ai_content_client.js',
  'server/ai-content-server.js',
  'server/publishing-control-server.js',
  'server/telegram-control.js',
  'server/publishing-worker-runtime.js',
  'server/publishing-worker-vault.js',
  'server/publishing-worker.js',
  'public/worker-admin.html',
];

test('release-critical modules exist on main product path', () => {
  const missing = REQUIRED_FILES.filter((file) => !exists(file));
  assert.deepEqual(missing, [], `Missing release-critical files: ${missing.join(', ')}`);
});

test('legacy scope-creep servers stay removed', () => {
  assert.equal(exists('server/real-estate-server.js'), false);
  assert.equal(exists('server/scheduler-example.js'), false);
});

test('LIVE publishing requires verified account state in app runtime', () => {
  const app = read('src/App.jsx');
  const preflight = read('src/publisher_preflight.js');
  const adapter = read('src/publisher_adapter.js');
  assert.match(app, /__requireVerification:\s*true/);
  assert.match(app, /__verifiedPlatforms/);
  assert.match(preflight, /unverified_account/);
  assert.match(adapter, /assertVerifiedForLive/);
});

test('browser UI has one explicit account connection center', () => {
  const connections = read('src/PlatformConnections.jsx');
  assert.match(connections, /Account Connection Center/);
  assert.match(connections, /Facebook Page/);
  assert.match(connections, /Instagram Business \/ Creator/);
  assert.match(connections, /TikTok/);
  assert.match(connections, /Kiểm tra kết nối/);
});

test('provider secrets remain server-side and worker secrets are never REACT_APP variables', () => {
  const envExample = read('.env.example');
  const aiClient = read('src/ai_content_client.js');
  const aiServer = read('server/ai-content-server.js');
  const workerAdmin = read('public/worker-admin.html');

  assert.match(aiServer, /process\.env\.GEMINI_API_KEY/);
  assert.doesNotMatch(aiClient, /GEMINI_API_KEY|OPENAI_API_KEY|ANTHROPIC_API_KEY/);
  assert.doesNotMatch(envExample, /^REACT_APP_(GEMINI|OPENAI|ANTHROPIC).*KEY=/m);
  assert.doesNotMatch(envExample, /^REACT_APP_DHP_PUBLISHING_(WORKER_TOKEN|VAULT_KEY)=/m);
  assert.match(workerAdmin, /sessionStorage/);
  assert.doesNotMatch(workerAdmin, /localStorage\.(setItem|getItem)/);
});

test('persistent worker stores account credentials encrypted at rest', () => {
  const vault = read('server/publishing-worker-vault.js');
  const worker = read('server/publishing-worker.js');
  assert.match(vault, /aes-256-gcm/);
  assert.match(vault, /createCipheriv/);
  assert.match(vault, /getAuthTag/);
  assert.match(worker, /DHP_PUBLISHING_VAULT_KEY/);
  assert.match(worker, /127\.0\.0\.1/);
});

test('campaign pipeline includes content, media prompt readiness and lifecycle audit', () => {
  const orchestrator = read('src/campaign_orchestrator.js');
  const media = read('src/campaign_media_prompt_engine.js');
  const audit = read('src/campaign_audit_log.js');
  assert.match(orchestrator, /GENERATING_CONTENT/);
  assert.match(orchestrator, /GENERATING_MEDIA/);
  assert.match(orchestrator, /appendWorkflowAuditEvent/);
  assert.match(media, /visualPrompt/);
  assert.match(media, /voiceOver/);
  assert.match(media, /negativePrompt/);
  assert.match(audit, /MAX_AUDIT_ENTRIES = 1000/);
});

test('official publishing path is separated from mock testing path', () => {
  const adapter = read('src/publisher_adapter.js');
  assert.match(adapter, /PUBLISH_MODE/);
  assert.match(adapter, /MOCK/);
  assert.match(adapter, /LIVE/);
  assert.match(adapter, /FacebookPagePublishingAPI/);
  assert.match(adapter, /InstagramPublishingAPI/);
  assert.match(adapter, /TikTokContentPostingAPI/);
});
