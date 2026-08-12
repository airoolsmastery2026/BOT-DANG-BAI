'use strict';

const crypto = require('crypto');

const SUPPORTED_PLATFORMS = new Set(['facebook', 'instagram', 'tiktok', 'linkedin', 'pinterest', 'youtube']);
const JOB_STATUS = Object.freeze({
  SCHEDULED: 'scheduled',
  PUBLISHING: 'publishing',
  PUBLISHED: 'published',
  FAILED: 'failed',
  DEAD_LETTER: 'dead_letter',
  CANCELLED: 'cancelled',
});
const MAX_ATTEMPTS = 5;

const clean = (value, max = 5000) => String(value || '').trim().slice(0, max);
const normalizePlatforms = (value) => Array.isArray(value)
  ? [...new Set(value.map((item) => clean(item, 40).toLowerCase()).filter((item) => SUPPORTED_PLATFORMS.has(item)))]
  : [];

const normalizeResults = (results, platforms) => {
  if (!results || typeof results !== 'object' || Array.isArray(results)) return {};
  return Object.fromEntries(Object.entries(results).filter(([platform]) => platforms.includes(platform)));
};

const normalizeTargetIds = (value) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return {
    facebook: clean(value.facebook, 200),
    instagram: clean(value.instagram, 200),
  };
};

const normalizePrivacyStatus = (value) => {
  const status = clean(value, 20).toLowerCase();
  return ['private', 'unlisted', 'public'].includes(status) ? status : 'private';
};

function isPlatformApiError(errorField) {
  if (!errorField) return false;
  if (typeof errorField === 'string') return !['ok', '0'].includes(errorField.trim().toLowerCase());
  if (typeof errorField === 'number') return errorField !== 0;
  if (typeof errorField !== 'object' || Array.isArray(errorField)) return true;
  const code = errorField.code ?? errorField.error_code;
  if (code === undefined || code === null || code === '') return true;
  if (typeof code === 'number') return code !== 0;
  return !['ok', '0'].includes(String(code).trim().toLowerCase());
}

function buildIdempotencyKey(input) {
  const stable = JSON.stringify({
    campaignId: clean(input.campaignId, 200),
    platforms: normalizePlatforms(input.platforms).sort(),
    scheduledTime: new Date(input.scheduledTime).toISOString(),
    content: clean(input.content, 5000),
    title: clean(input.title, 100),
    imageUrl: clean(input.imageUrl, 2000),
    videoUrl: clean(input.videoUrl, 2000),
    privacyStatus: normalizePrivacyStatus(input.privacyStatus),
  });
  return crypto.createHash('sha256').update(stable).digest('hex');
}

function normalizeJob(input, { now = Date.now(), existing = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Publishing job không hợp lệ.');
  const content = clean(input.content, 5000);
  const platforms = normalizePlatforms(input.platforms);
  const scheduled = new Date(input.scheduledTime);
  if (!content) throw new Error('Publishing job thiếu nội dung.');
  if (!platforms.length) throw new Error('Publishing job thiếu nền tảng được hỗ trợ.');
  if (Number.isNaN(scheduled.getTime())) throw new Error('Publishing job có thời gian không hợp lệ.');
  if (platforms.includes('youtube') && !/^https?:\/\//i.test(clean(input.videoUrl, 2000))) {
    throw new Error('YouTube job cần video URL HTTP/HTTPS công khai.');
  }

  const results = normalizeResults(input.results, platforms);
  const pendingPlatforms = platforms.filter((platform) => results[platform]?.success !== true);
  const attemptCount = Math.max(Number(input.attemptCount || 0), 0);
  const createdAt = existing && input.createdAt ? new Date(input.createdAt) : new Date(now);
  const updatedAt = existing && input.updatedAt ? new Date(input.updatedAt) : new Date(now);
  const status = Object.values(JOB_STATUS).includes(input.status)
    ? input.status
    : JOB_STATUS.SCHEDULED;

  return {
    id: clean(input.id, 200) || crypto.randomUUID(),
    campaignId: clean(input.campaignId, 200) || null,
    idempotencyKey: clean(input.idempotencyKey, 200) || buildIdempotencyKey({ ...input, platforms, content, scheduledTime: scheduled.toISOString() }),
    content,
    title: clean(input.title, 100),
    platforms,
    pendingPlatforms,
    scheduledTime: scheduled.toISOString(),
    imageUrl: clean(input.imageUrl, 2000),
    videoUrl: clean(input.videoUrl, 2000),
    privacyStatus: normalizePrivacyStatus(input.privacyStatus),
    targetIds: normalizeTargetIds(input.targetIds),
    status,
    results,
    attemptCount,
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date(now).toISOString() : createdAt.toISOString(),
    updatedAt: Number.isNaN(updatedAt.getTime()) ? new Date(now).toISOString() : updatedAt.toISOString(),
    publishedAt: input.publishedAt ? new Date(input.publishedAt).toISOString() : null,
    deadLetteredAt: input.deadLetteredAt ? new Date(input.deadLetteredAt).toISOString() : null,
    lastAttemptAt: input.lastAttemptAt ? new Date(input.lastAttemptAt).toISOString() : null,
  };
}

function normalizeStoredJobs(value) {
  if (!Array.isArray(value)) return [];
  return value.map((job) => {
    try {
      return normalizeJob(job, { existing: true });
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function assertNoDuplicate(jobs, job) {
  const duplicate = jobs.find((item) => (
    item.idempotencyKey === job.idempotencyKey
    && ![JOB_STATUS.CANCELLED, JOB_STATUS.DEAD_LETTER].includes(item.status)
  ));
  if (duplicate) {
    const error = new Error('Publishing job trùng idempotency key.');
    error.code = 'DUPLICATE_JOB';
    error.existingJobId = duplicate.id;
    throw error;
  }
}

function getDueJobs(jobs, { now = Date.now(), limit = 50 } = {}) {
  const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), 200);
  return jobs
    .filter((job) => job.status === JOB_STATUS.SCHEDULED)
    .filter((job) => new Date(job.scheduledTime).getTime() <= now)
    .sort((left, right) => new Date(left.scheduledTime) - new Date(right.scheduledTime))
    .slice(0, safeLimit);
}

function markPublishing(job, { now = Date.now() } = {}) {
  if (job.status !== JOB_STATUS.SCHEDULED) throw new Error('Chỉ job scheduled mới được chuyển sang publishing.');
  const pendingPlatforms = job.platforms.filter((platform) => job.results[platform]?.success !== true);
  const pollingOnly = pendingPlatforms.length > 0
    && pendingPlatforms.every((platform) => job.results[platform]?.pending === true);
  if (!pollingOnly && job.attemptCount >= MAX_ATTEMPTS) {
    return markDeadLetter(job, { now, reason: 'Đã vượt số lần thử tối đa.' });
  }
  const timestamp = new Date(now).toISOString();
  return {
    ...job,
    status: JOB_STATUS.PUBLISHING,
    attemptCount: pollingOnly ? job.attemptCount : job.attemptCount + 1,
    pendingPlatforms,
    lastAttemptAt: timestamp,
    updatedAt: timestamp,
  };
}

function mergePublishResults(job, results, { now = Date.now() } = {}) {
  const timestamp = new Date(now).toISOString();
  const merged = {
    ...job.results,
    ...Object.fromEntries(Object.entries(results || {}).filter(([platform]) => job.platforms.includes(platform))),
  };
  const pendingPlatforms = job.platforms.filter((platform) => merged[platform]?.success !== true);
  const allSucceeded = pendingPlatforms.length === 0;
  const pendingOnly = pendingPlatforms.length > 0
    && pendingPlatforms.every((platform) => merged[platform]?.pending === true);
  const exhausted = !allSucceeded && !pendingOnly && job.attemptCount >= MAX_ATTEMPTS;

  return {
    ...job,
    results: merged,
    pendingPlatforms,
    status: allSucceeded ? JOB_STATUS.PUBLISHED : exhausted ? JOB_STATUS.DEAD_LETTER : JOB_STATUS.FAILED,
    publishedAt: allSucceeded ? timestamp : job.publishedAt,
    deadLetteredAt: exhausted ? timestamp : job.deadLetteredAt,
    updatedAt: timestamp,
  };
}

function markDeadLetter(job, { now = Date.now(), reason = '' } = {}) {
  const timestamp = new Date(now).toISOString();
  return {
    ...job,
    status: JOB_STATUS.DEAD_LETTER,
    deadLetteredAt: timestamp,
    updatedAt: timestamp,
    results: reason
      ? { ...job.results, system: { success: false, error: clean(reason, 1000) } }
      : job.results,
  };
}

function retryJob(job, { now = Date.now(), delayMs = 60_000 } = {}) {
  if (![JOB_STATUS.FAILED, JOB_STATUS.PUBLISHING].includes(job.status)) {
    throw new Error('Chỉ job failed/publishing mới được retry.');
  }
  const pendingPlatforms = job.platforms.filter((platform) => job.results[platform]?.success !== true);
  const pollingOnly = pendingPlatforms.length > 0
    && pendingPlatforms.every((platform) => job.results[platform]?.pending === true);
  if (!pollingOnly && job.attemptCount >= MAX_ATTEMPTS) return markDeadLetter(job, { now, reason: 'Đã vượt số lần thử tối đa.' });
  if (!pendingPlatforms.length) {
    return { ...job, status: JOB_STATUS.PUBLISHED, publishedAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString() };
  }
  return {
    ...job,
    status: JOB_STATUS.SCHEDULED,
    pendingPlatforms,
    scheduledTime: new Date(now + Math.max(Number(delayMs) || 0, 1_000)).toISOString(),
    updatedAt: new Date(now).toISOString(),
  };
}

function recoverStuckJobs(jobs, { now = Date.now(), timeoutMs = 15 * 60_000 } = {}) {
  const safeTimeout = Math.max(Number(timeoutMs) || 0, 60_000);
  return jobs.map((job) => {
    if (job.status !== JOB_STATUS.PUBLISHING) return job;
    const lastAttempt = new Date(job.lastAttemptAt || job.updatedAt).getTime();
    if (!Number.isFinite(lastAttempt) || now - lastAttempt < safeTimeout) return job;
    return retryJob(job, { now, delayMs: 60_000 });
  });
}

function summarizeJobs(jobs, { now = Date.now() } = {}) {
  const summary = {
    total: jobs.length,
    scheduled: 0,
    publishing: 0,
    published: 0,
    failed: 0,
    dead_letter: 0,
    cancelled: 0,
    due: 0,
  };
  jobs.forEach((job) => {
    if (Object.prototype.hasOwnProperty.call(summary, job.status)) summary[job.status] += 1;
    if (job.status === JOB_STATUS.SCHEDULED && new Date(job.scheduledTime).getTime() <= now) summary.due += 1;
  });
  return summary;
}

module.exports = {
  JOB_STATUS,
  MAX_ATTEMPTS,
  SUPPORTED_PLATFORMS,
  assertNoDuplicate,
  buildIdempotencyKey,
  getDueJobs,
  isPlatformApiError,
  markDeadLetter,
  markPublishing,
  mergePublishResults,
  normalizeJob,
  normalizeStoredJobs,
  recoverStuckJobs,
  retryJob,
  summarizeJobs,
};
