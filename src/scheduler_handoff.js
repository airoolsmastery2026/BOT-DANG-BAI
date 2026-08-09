export const SCHEDULER_HANDOFF_STORAGE_KEY = 'bot_dang_bai_scheduler_handoff';

const SUPPORTED_SCHEDULER_PLATFORMS = new Set(['facebook', 'instagram', 'tiktok']);
const MAX_SCHEDULE_SLOTS = 365;

function normalizeScheduleSlots(value) {
  const rawSlots = Array.isArray(value?.scheduleSlots)
    ? value.scheduleSlots
    : value?.workflow?.schedulePlan?.slots || [];

  const normalized = rawSlots
    .map((slot) => {
      const rawDate = typeof slot === 'string'
        ? slot
        : slot?.publishAt || slot?.scheduledAt || slot?.date || null;
      if (!rawDate) return null;
      const date = new Date(rawDate);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    })
    .filter(Boolean);

  return [...new Set(normalized)]
    .sort((left, right) => new Date(left).getTime() - new Date(right).getTime())
    .slice(0, MAX_SCHEDULE_SLOTS);
}

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

  const scheduleSlots = normalizeScheduleSlots(value);
  const publishAt = value.publishAt
    || scheduleSlots[0]
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
    scheduleSlots: scheduleSlots.length
      ? scheduleSlots
      : (publishDate ? [publishDate.toISOString()] : []),
    scheduleSlotCount: scheduleSlots.length || (publishDate ? 1 : 0),
    durationDays: Number(value.workflow?.campaign?.durationDays || value.workflow?.schedulePlan?.durationDays || 1),
    postsPerDay: Number(value.workflow?.campaign?.postsPerDay || value.workflow?.schedulePlan?.postsPerDay || 1),
    hasImageJob: jobs.some((job) => job.type === 'image'),
    hasVideoJob: Boolean(value.videoUrl) || jobs.some((job) => job.type === 'video'),
    content: String(value.content || ''),
    videoUrl: String(value.videoUrl || ''),
    source: String(value.source || ''),
    sourceJobId: String(value.sourceJobId || ''),
    sourceAccessToken: String(value.sourceAccessToken || ''),
    sourceCallbackUrl: String(value.sourceCallbackUrl || ''),
    handedOffAt: value.handedOffAt || value.createdAt || null,
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
