import { RECURRENCE, schedulePosts } from './post_manager';

const SUPPORTED_PLATFORMS = new Set(['facebook', 'instagram', 'tiktok']);

function normalizeSlots(workflow) {
  const rawSlots = workflow?.schedulePlan?.slots || [];
  return [...new Set(rawSlots
    .map((slot) => slot?.publishAt || slot)
    .map((value) => {
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? null : date.toISOString();
    })
    .filter(Boolean))]
    .sort((a, b) => new Date(a) - new Date(b));
}

function getChannelContent(channel, fallbackContent) {
  return String(channel?.content?.text || fallbackContent || '').trim();
}

export function buildCampaignQueueEntries(workflow, options = {}) {
  if (!workflow?.campaign?.id || !Array.isArray(workflow?.channels)) {
    throw new Error('Workflow chiến dịch không hợp lệ.');
  }
  if (workflow.workflowStatus !== 'approved') {
    throw new Error('Chiến dịch phải được duyệt trước khi xếp hàng đợi.');
  }

  const slots = normalizeSlots(workflow);
  if (!slots.length) throw new Error('Chiến dịch chưa có lịch đăng hợp lệ.');

  const enabledPlatforms = new Set(
    (options.platforms || [...SUPPORTED_PLATFORMS])
      .map((platform) => String(platform || '').trim().toLowerCase())
      .filter((platform) => SUPPORTED_PLATFORMS.has(platform)),
  );

  const entries = [];
  const skippedPlatforms = [];

  for (const channel of workflow.channels) {
    const platform = String(channel?.platform || '').trim().toLowerCase();
    if (!SUPPORTED_PLATFORMS.has(platform) || !enabledPlatforms.has(platform)) {
      skippedPlatforms.push(platform || 'unknown');
      continue;
    }

    const content = getChannelContent(channel, options.fallbackContent || workflow.campaign.topic);
    if (!content) throw new Error(`Kênh ${platform} chưa có nội dung.`);

    for (const scheduledTime of slots) {
      entries.push({
        campaignId: workflow.campaign.id,
        content,
        platforms: [platform],
        scheduledTime,
        imageUrl: String(options.imageUrls?.[platform] || options.imageUrl || '').trim(),
        videoUrl: String(options.videoUrls?.[platform] || options.videoUrl || '').trim(),
        targetIds: options.targetIds || {},
        recurrence: RECURRENCE.NONE,
        campaignSlotId: `${workflow.campaign.id}|${platform}|${scheduledTime}`,
      });
    }
  }

  if (!entries.length) {
    throw new Error('Không có nền tảng được hỗ trợ để đưa vào hàng đợi.');
  }

  return {
    entries,
    skippedPlatforms: [...new Set(skippedPlatforms.filter(Boolean))],
    slotCount: slots.length,
    platformCount: new Set(entries.flatMap((entry) => entry.platforms)).size,
  };
}

export function enqueueCampaignWorkflow(workflow, options = {}) {
  const plan = buildCampaignQueueEntries(workflow, options);
  const posts = schedulePosts(plan.entries);
  return { ...plan, posts };
}
