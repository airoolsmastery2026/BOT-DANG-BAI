const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
const MAX_SLOTS = 365;

function asPositiveInteger(value, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.floor(parsed));
}

function normalizeStart(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return null;
  return date;
}

export function buildCampaignSchedule({
  startAt,
  durationDays = 1,
  postsPerDay = 1,
  timezone = DEFAULT_TIMEZONE,
} = {}) {
  const start = normalizeStart(startAt);
  if (!start) {
    return {
      timezone,
      slots: [],
      valid: false,
      errors: ['Chưa có thời gian bắt đầu hợp lệ.'],
    };
  }

  const normalizedDays = Math.min(asPositiveInteger(durationDays), 365);
  const normalizedPostsPerDay = Math.min(asPositiveInteger(postsPerDay), 10);
  const requestedSlots = normalizedDays * normalizedPostsPerDay;
  const slotCount = Math.min(requestedSlots, MAX_SLOTS);
  const intervalMinutes = Math.floor((24 * 60) / normalizedPostsPerDay);
  const slots = [];

  for (let day = 0; day < normalizedDays && slots.length < slotCount; day += 1) {
    for (let index = 0; index < normalizedPostsPerDay && slots.length < slotCount; index += 1) {
      const slot = new Date(start);
      slot.setDate(start.getDate() + day);
      slot.setMinutes(start.getMinutes() + index * intervalMinutes);
      slots.push({
        index: slots.length,
        dayNumber: day + 1,
        sequenceInDay: index + 1,
        publishAt: slot.toISOString(),
      });
    }
  }

  const errors = [];
  if (requestedSlots > MAX_SLOTS) {
    errors.push(`Lịch đã được giới hạn còn ${MAX_SLOTS} mốc để bảo vệ hiệu năng.`);
  }

  return {
    timezone,
    durationDays: normalizedDays,
    postsPerDay: normalizedPostsPerDay,
    slots,
    valid: true,
    errors,
  };
}

export function attachScheduleToWorkflow(workflow, options = {}) {
  if (!workflow?.campaign?.id) throw new Error('Workflow không hợp lệ để lập lịch.');

  const firstPublishAt = options.startAt
    || workflow.channels?.flatMap((channel) => channel.jobs || []).find((job) => job.publishAt)?.publishAt
    || null;
  const schedule = buildCampaignSchedule({
    startAt: firstPublishAt,
    durationDays: options.durationDays || workflow.campaign.durationDays || 1,
    postsPerDay: options.postsPerDay || workflow.campaign.postsPerDay || 1,
    timezone: options.timezone || workflow.campaign.timezone || DEFAULT_TIMEZONE,
  });

  return {
    ...workflow,
    campaign: {
      ...workflow.campaign,
      durationDays: schedule.durationDays || workflow.campaign.durationDays || 1,
      postsPerDay: schedule.postsPerDay || workflow.campaign.postsPerDay || 1,
    },
    schedulePlan: schedule,
  };
}

export function evaluateScheduleConflicts(schedulePlan, minimumGapMinutes = 15) {
  const slots = Array.isArray(schedulePlan?.slots) ? schedulePlan.slots : [];
  const conflicts = [];
  const minimumGapMs = Math.max(1, Number(minimumGapMinutes) || 15) * 60_000;

  for (let index = 1; index < slots.length; index += 1) {
    const previous = new Date(slots[index - 1].publishAt).getTime();
    const current = new Date(slots[index].publishAt).getTime();
    if (!Number.isNaN(previous) && !Number.isNaN(current) && current - previous < minimumGapMs) {
      conflicts.push({ previousIndex: index - 1, currentIndex: index });
    }
  }

  return {
    valid: conflicts.length === 0,
    conflicts,
  };
}
