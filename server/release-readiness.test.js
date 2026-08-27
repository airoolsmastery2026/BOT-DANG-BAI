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
  'src/PersistentPlatformConnections.jsx',
  'src/platform_connection_catalog.js',
  'src/persistent_platform_connection_catalog.js',
  'src/desktop_publishing_worker.js',
  'src/master_skill_catalog.js',
  'src/master_content_skill_runtime.js',
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
  'server/publishing-control-runtime.js',
  'server/publishing-control-server.js',
  'server/telegram-control.js',
  'server/publishing-worker-runtime.js',
  'server/publishing-worker-vault.js',
  'server/publishing-worker-linkedin.js',
  'server/publishing-worker-youtube.js',
  'server/publishing-worker.js',
  'desktop/preload.cjs',
  'desktop/publishing-worker-manager.cjs',
  'skills/registry.json',
  'skills/dhp-master-content-system/SKILL.md',
  'skills/dhp-master-content-system/metadata.json',
  'public/worker-admin.html',
  'public/worker-platforms.html',
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
  const catalog = read('src/platform_connection_catalog.js');
  assert.match(connections, /Account Connection Center/);
  assert.match(connections, /PLATFORM_CONNECTIONS\.map/);
  assert.match(catalog, /Facebook Page/);
  assert.match(catalog, /Instagram Business \/ Creator/);
  assert.match(catalog, /TikTok/);
  assert.match(catalog, /developers\.facebook\.com\/tools\/explorer/);
  assert.match(catalog, /facebook\.com\/help\/1503421039731588/);
  assert.match(catalog, /developers\.tiktok\.com\/apps/);
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

test('persistent worker fails closed and reports provider verification health', () => {
  const runtime = read('server/publishing-worker-runtime.js');
  const vault = read('server/publishing-worker-vault.js');
  const worker = read('server/publishing-worker.js');
  const control = read('server/publishing-control-runtime.js');
  const linkedin = read('server/publishing-worker-linkedin.js');
  const youtube = read('server/publishing-worker-youtube.js');
  assert.match(runtime, /JOB_STORE_CORRUPT/);
  assert.match(runtime, /function replaceJob/);
  assert.match(vault, /VAULT_CORRUPT/);
  assert.match(vault, /recordVerification/);
  assert.match(vault, /ACCOUNT_NOT_VERIFIED/);
  assert.match(vault, /getVerified/);
  assert.match(worker, /verifyAndRecordPlatform/);
  assert.match(worker, /vault\.assertVerified\(job\.platforms\)/);
  assert.match(worker, /resolveVerifiedTarget/);
  assert.match(control, /CONTROL_STATE_CORRUPT/);
  assert.match(linkedin, /api\.linkedin\.com\/v2\/me/);
  assert.match(linkedin, /api\.linkedin\.com\/rest\/organizations/);
  assert.match(youtube, /UNSAFE_SOURCE_URL/);
  assert.match(youtube, /isTrustedUploadUrl/);
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
