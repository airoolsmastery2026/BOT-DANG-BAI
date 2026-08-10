'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  campaignWorkflowToWorkerJobs,
  validateCampaignWorkflow,
} = require('./campaign-to-worker');

const workflow = (overrides = {}) => ({
  campaign: { id: 'campaign-1', topic: 'Tủ bếp veneer' },
  workflowStatus: 'approved',
  schedulePlan: {
    slots: [
      { publishAt: '2026-08-11T01:00:00.000Z' },
      { publishAt: '2026-08-11T08:00:00.000Z' },
    ],
  },
  channels: [
    {
      platform: 'facebook',
      content: { text: 'Facebook copy' },
      jobs: [{ type: 'image', output: { imageUrl: 'https://example.com/fb.jpg' } }],
    },
    {
      platform: 'instagram',
      content: { text: 'Instagram copy' },
      jobs: [{ type: 'image', result: { url: 'https://example.com/ig.jpg' } }],
    },
    {
      platform: 'tiktok',
      content: { text: 'TikTok copy' },
      jobs: [{ type: 'video', output: { videoUrl: 'https://example.com/tt.mp4' } }],
    },
    {
      platform: 'linkedin',
      content: { text: 'LinkedIn copy' },
      jobs: [],
    },
    {
      platform: 'pinterest',
      content: { text: 'Pinterest copy' },
      jobs: [{ type: 'image', output: { imageUrl: 'https://example.com/pin.jpg' } }],
    },
    {
      platform: 'youtube',
      content: { text: 'YouTube copy' },
      jobs: [{ type: 'video', output: { videoUrl: 'https://example.com/yt.mp4' } }],
    },
  ],
  ...overrides,
});

test('expands approved workflow into supported platform jobs for every schedule slot', () => {
  const result = campaignWorkflowToWorkerJobs(workflow());
  assert.equal(result.campaignId, 'campaign-1');
  assert.equal(result.slotCount, 2);
  assert.equal(result.platformCount, 5);
  assert.equal(result.jobs.length, 10);
  assert.deepEqual(result.skippedPlatforms, ['youtube']);

  const instagram = result.jobs.find((job) => job.platforms[0] === 'instagram');
  const tiktok = result.jobs.find((job) => job.platforms[0] === 'tiktok');
  const linkedin = result.jobs.find((job) => job.platforms[0] === 'linkedin');
  const pinterest = result.jobs.find((job) => job.platforms[0] === 'pinterest');
  assert.equal(instagram.imageUrl, 'https://example.com/ig.jpg');
  assert.equal(tiktok.videoUrl, 'https://example.com/tt.mp4');
  assert.equal(linkedin.content, 'LinkedIn copy');
  assert.equal(pinterest.imageUrl, 'https://example.com/pin.jpg');
});

test('creates stable idempotency keys for the same campaign workflow', () => {
  const first = campaignWorkflowToWorkerJobs(workflow());
  const second = campaignWorkflowToWorkerJobs(workflow());
  assert.deepEqual(
    first.jobs.map((job) => job.idempotencyKey),
    second.jobs.map((job) => job.idempotencyKey),
  );
});

test('blocks unapproved workflow before persistent handoff', () => {
  const validation = validateCampaignWorkflow(workflow({ workflowStatus: 'draft' }));
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(' '), /approved hoặc scheduled/);
});

test('blocks media-required platforms when rendered public URLs are missing', () => {
  const input = workflow();
  input.channels = input.channels.map((channel) => (
    ['instagram', 'tiktok', 'pinterest'].includes(channel.platform)
      ? { ...channel, jobs: [] }
      : channel
  ));
  const validation = validateCampaignWorkflow(input);
  assert.equal(validation.valid, false);
  assert.match(validation.errors.join(' '), /instagram: thiếu image URL/);
  assert.match(validation.errors.join(' '), /tiktok: thiếu video URL/);
  assert.match(validation.errors.join(' '), /pinterest: thiếu image URL/);
});

test('rejects workflow with no persistent-worker platform', () => {
  const input = workflow();
  input.channels = [{ platform: 'youtube', content: { text: 'YouTube' }, jobs: [] }];
  assert.throws(() => campaignWorkflowToWorkerJobs(input), /không có nền tảng nào/);
});
