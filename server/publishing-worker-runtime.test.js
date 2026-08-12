'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  JOB_STATUS,
  MAX_ATTEMPTS,
  assertNoDuplicate,
  getDueJobs,
  isPlatformApiError,
  markPublishing,
  mergePublishResults,
  normalizeJob,
  recoverStuckJobs,
  retryJob,
  summarizeJobs,
} = require('./publishing-worker-runtime');

const baseJob = (overrides = {}) => normalizeJob({
  id: 'job-1',
  campaignId: 'campaign-1',
  content: 'Bài đăng thử nghiệm',
  platforms: ['facebook'],
  scheduledTime: '2026-08-10T00:00:00.000Z',
  ...overrides,
}, { now: new Date('2026-08-09T23:00:00.000Z').getTime() });

test('normalizes supported platforms and creates idempotency key', () => {
  const job = baseJob({ platforms: ['Facebook', 'facebook', 'LinkedIn', 'Pinterest', 'YouTube', 'unknown'], videoUrl: 'https://cdn.example/video.mp4' });
  assert.deepEqual(job.platforms, ['facebook', 'linkedin', 'pinterest', 'youtube']);
  assert.equal(job.status, JOB_STATUS.SCHEDULED);
  assert.equal(job.attemptCount, 0);
  assert.equal(job.idempotencyKey.length, 64);
});

test('YouTube jobs require video URL and default to private', () => {
  assert.throws(() => baseJob({ platforms: ['youtube'] }), /YouTube job cần video URL/);
  const job = baseJob({
    platforms: ['youtube'],
    videoUrl: 'https://cdn.example/short.mp4',
    title: 'Short demo',
    privacyStatus: 'public',
  });
  assert.equal(job.title, 'Short demo');
  assert.equal(job.privacyStatus, 'public');
  const safe = baseJob({ platforms: ['youtube'], videoUrl: 'https://cdn.example/short.mp4', privacyStatus: 'invalid' });
  assert.equal(safe.privacyStatus, 'private');
});

test('recognizes TikTok ok envelope as success and real API errors as failures', () => {
  assert.equal(isPlatformApiError({ code: 'ok', message: '' }), false);
  assert.equal(isPlatformApiError({ code: 0 }), false);
  assert.equal(isPlatformApiError({ code: 'invalid_param', message: 'bad request' }), true);
  assert.equal(isPlatformApiError({ code: 190, message: 'invalid token' }), true);
});

test('rejects duplicate active idempotency key', () => {
  const job = baseJob();
  assert.throws(() => assertNoDuplicate([job], { ...job, id: 'job-2' }), /trùng idempotency/i);
});

test('selects only due scheduled jobs in order', () => {
  const jobs = [
    baseJob({ id: 'future', scheduledTime: '2026-08-10T03:00:00.000Z' }),
    baseJob({ id: 'due-2', scheduledTime: '2026-08-10T00:02:00.000Z' }),
    baseJob({ id: 'due-1', scheduledTime: '2026-08-10T00:01:00.000Z' }),
    baseJob({ id: 'failed', status: JOB_STATUS.FAILED }),
  ];
  const due = getDueJobs(jobs, { now: new Date('2026-08-10T00:05:00.000Z').getTime() });
  assert.deepEqual(due.map((job) => job.id), ['due-1', 'due-2']);
});

test('merges platform results and keeps only failed platform pending', () => {
  const job = markPublishing(baseJob({ platforms: ['facebook', 'instagram'] }), { now: 1000 });
  const partial = mergePublishResults(job, {
    facebook: { success: true, externalPostId: 'fb-1' },
    instagram: { success: false, error: 'temporary' },
  }, { now: 2000 });

  assert.equal(partial.status, JOB_STATUS.FAILED);
  assert.deepEqual(partial.pendingPlatforms, ['instagram']);
  assert.equal(partial.publishedAt, null);

  const retried = retryJob(partial, { now: 3000, delayMs: 1000 });
  assert.equal(retried.status, JOB_STATUS.SCHEDULED);
  assert.deepEqual(retried.pendingPlatforms, ['instagram']);
});

test('polling-only platform does not consume retry budget', () => {
  const polling = baseJob({
    platforms: ['tiktok'],
    status: JOB_STATUS.SCHEDULED,
    attemptCount: 1,
    results: {
      tiktok: {
        success: false,
        pending: true,
        retryable: true,
        externalPostId: 'publish-123',
        remoteStatus: 'PROCESSING_DOWNLOAD',
      },
    },
  });

  const active = markPublishing(polling, { now: 1000 });
  assert.equal(active.attemptCount, 1);

  const waiting = mergePublishResults(active, {
    tiktok: {
      success: false,
      pending: true,
      retryable: true,
      externalPostId: 'publish-123',
      remoteStatus: 'PROCESSING_DOWNLOAD',
    },
  }, { now: 2000 });
  assert.equal(waiting.status, JOB_STATUS.FAILED);
  assert.equal(waiting.deadLetteredAt, null);

  const nextPoll = retryJob(waiting, { now: 3000, delayMs: 30_000 });
  assert.equal(nextPoll.status, JOB_STATUS.SCHEDULED);
  assert.equal(nextPoll.attemptCount, 1);
});

test('moves exhausted job to dead letter', () => {
  const job = baseJob({ status: JOB_STATUS.FAILED, attemptCount: MAX_ATTEMPTS });
  const dead = retryJob(job, { now: 5000 });
  assert.equal(dead.status, JOB_STATUS.DEAD_LETTER);
  assert.ok(dead.deadLetteredAt);
});

test('recovers stale publishing jobs without touching fresh ones', () => {
  const now = new Date('2026-08-10T01:00:00.000Z').getTime();
  const stale = baseJob({
    id: 'stale',
    status: JOB_STATUS.PUBLISHING,
    attemptCount: 1,
    lastAttemptAt: '2026-08-10T00:30:00.000Z',
  });
  const fresh = baseJob({
    id: 'fresh',
    status: JOB_STATUS.PUBLISHING,
    attemptCount: 1,
    lastAttemptAt: '2026-08-10T00:59:00.000Z',
  });
  const recovered = recoverStuckJobs([stale, fresh], { now, timeoutMs: 10 * 60_000 });
  assert.equal(recovered[0].status, JOB_STATUS.SCHEDULED);
  assert.equal(recovered[1].status, JOB_STATUS.PUBLISHING);
});

test('summarizes due and terminal worker jobs', () => {
  const now = new Date('2026-08-10T01:00:00.000Z').getTime();
  const jobs = [
    baseJob(),
    baseJob({ id: 'published', status: JOB_STATUS.PUBLISHED }),
    baseJob({ id: 'dead', status: JOB_STATUS.DEAD_LETTER }),
  ];
  assert.deepEqual(summarizeJobs(jobs, { now }), {
    total: 3,
    scheduled: 1,
    publishing: 0,
    published: 1,
    failed: 0,
    dead_letter: 1,
    cancelled: 0,
    due: 1,
  });
});
