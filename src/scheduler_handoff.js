export const SCHEDULER_HANDOFF_STORAGE_KEY = 'bot_dang_bai_scheduler_handoff';

const SUPPORTED_SCHEDULER_PLATFORMS = new Set(['facebook', 'instagram', 'tiktok']);

export function normalizeSchedulerHandoff(value) {
  if (!value || typeof value !== 'object') return null;

  const campaignId = String(value.campaignId || value.workflow?.campaign?.id || '').trim();
  const topic = String(value.topic || value.workflow?.campaign?.topic || '').trim();
  const rawPlatforms = Array.isArray(value.platforms)
    ? value.platforms
    : value.workflow?.channels?.map((channel) => channel.platform) || [];
  const platforms = [...new Set(rawPlatforms
    .map((platform) => String(platform || '').trim().toLowerCase())
    .filter((platform) => SUPPORTED_SCHEDULER_PLATFORMS.has(platform)))];

  const publishAt = value.publishAt
    || value.workflow?.channels?.flatMap((channel) => channel.jobs || []).find((job) => job.publishAt)?.publishAt
    || null;
  const publishDate = publishAt ? new Date(publishAt) : null;

  if (!campaignId || !topic || platforms.length === 0) return null;
  if (publishDate && Number.isNaN(publishDate.getTime())) return null;

  const jobs = value.workflow?.channels?.flatMap((channel) => channel.jobs || []) || [];

  return {
    campaignId,
    topic,
    platforms,
    publishAt: publishDate ? publishDate.toISOString() : null,
    hasImageJob: jobs.some((job) => job.type === 'image'),
    hasVideoJob: jobs.some((job) => job.type === 'video'),
    handedOffAt: value.handedOffAt || null,
  };
}

export function loadSchedulerHandoff(storage) {
  const target = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return null;

  try {
    return normalizeSchedulerHandoff(JSON.parse(target.getItem(SCHEDULER_HANDOFF_STORAGE_KEY) || 'null'));
  } catch {
    return null;
  }
}

export function clearSchedulerHandoff(storage) {
  const target = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return false;

  try {
    target.removeItem(SCHEDULER_HANDOFF_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}
