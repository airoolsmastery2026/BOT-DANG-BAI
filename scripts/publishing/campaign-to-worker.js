'use strict';

const crypto = require('crypto');

const WORKER_PLATFORMS = new Set(['facebook', 'instagram', 'tiktok']);

const clean = (value, max = 5000) => String(value || '').trim().slice(0, max);

const toIso = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

const stableJobKey = ({ campaignId, platform, publishAt, content }) => crypto
  .createHash('sha256')
  .update([campaignId, platform, publishAt, content].join('|'))
  .digest('hex');

const getScheduleSlots = (workflow) => {
  const raw = Array.isArray(workflow?.schedulePlan?.slots) && workflow.schedulePlan.slots.length
    ? workflow.schedulePlan.slots
    : workflow?.channels?.flatMap((channel) => channel.jobs || []).map((job) => job.publishAt).filter(Boolean) || [];

  return [...new Set(raw.map((slot) => {
    if (typeof slot === 'string') return toIso(slot);
    return toIso(slot?.publishAt || slot?.scheduledAt || slot?.date);
  }).filter(Boolean))].sort();
};

const pickMediaUrl = (jobs, type) => {
  const job = (jobs || []).find((item) => item?.type === type);
  if (!job) return '';
  const candidates = type === 'image'
    ? [job.imageUrl, job.output?.url, job.output?.imageUrl, job.renderedUrl, job.result?.url]
    : [job.videoUrl, job.output?.url, job.output?.videoUrl, job.renderedUrl, job.result?.url];
  return clean(candidates.find((value) => /^https?:\/\//i.test(String(value || '').trim())) || '', 2000);
};

const channelContent = (channel) => clean(
  channel?.content?.text
  || channel?.content?.caption
  || channel?.content?.description
  || channel?.content?.title,
  5000,
);

function validateCampaignWorkflow(workflow) {
  const errors = [];
  const campaignId = clean(workflow?.campaign?.id, 200);
  if (!campaignId) errors.push('Workflow thiếu campaign ID.');
  if (!Array.isArray(workflow?.channels) || workflow.channels.length === 0) errors.push('Workflow thiếu channel.');
  if (!getScheduleSlots(workflow).length) errors.push('Workflow thiếu lịch đăng hợp lệ.');
  if (!['approved', 'scheduled'].includes(workflow?.workflowStatus)) {
    errors.push('Workflow phải ở trạng thái approved hoặc scheduled trước khi gửi sang worker.');
  }

  (workflow?.channels || [])
    .filter((channel) => WORKER_PLATFORMS.has(clean(channel.platform, 40).toLowerCase()))
    .forEach((channel) => {
      const platform = clean(channel.platform, 40).toLowerCase();
      if (!channelContent(channel)) errors.push(`${platform}: thiếu nội dung đã duyệt.`);
      if (platform === 'instagram' && !pickMediaUrl(channel.jobs, 'image')) {
        errors.push('instagram: thiếu image URL đã render công khai.');
      }
      if (platform === 'tiktok' && !pickMediaUrl(channel.jobs, 'video')) {
        errors.push('tiktok: thiếu video URL đã render công khai.');
      }
    });

  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

function campaignWorkflowToWorkerJobs(workflow) {
  const validation = validateCampaignWorkflow(workflow);
  if (!validation.valid) throw new Error(validation.errors.join(' '));

  const campaignId = clean(workflow.campaign.id, 200);
  const slots = getScheduleSlots(workflow);
  const jobs = [];
  const skippedPlatforms = [];

  for (const channel of workflow.channels) {
    const platform = clean(channel.platform, 40).toLowerCase();
    if (!WORKER_PLATFORMS.has(platform)) {
      skippedPlatforms.push(platform);
      continue;
    }

    const content = channelContent(channel);
    const imageUrl = pickMediaUrl(channel.jobs, 'image');
    const videoUrl = pickMediaUrl(channel.jobs, 'video');

    for (const publishAt of slots) {
      jobs.push({
        campaignId,
        content,
        platforms: [platform],
        scheduledTime: publishAt,
        imageUrl,
        videoUrl,
        targetIds: {},
        idempotencyKey: stableJobKey({ campaignId, platform, publishAt, content }),
        metadata: {
          source: 'campaign-workflow',
          sourceWorkflowStatus: workflow.workflowStatus,
          platform,
        },
      });
    }
  }

  if (!jobs.length) throw new Error('Workflow không có Facebook, Instagram hoặc TikTok để gửi sang persistent worker.');

  return {
    campaignId,
    jobs,
    slotCount: slots.length,
    platformCount: new Set(jobs.map((job) => job.platforms[0])).size,
    skippedPlatforms: [...new Set(skippedPlatforms.filter(Boolean))],
  };
}

module.exports = {
  WORKER_PLATFORMS,
  campaignWorkflowToWorkerJobs,
  getScheduleSlots,
  pickMediaUrl,
  stableJobKey,
  validateCampaignWorkflow,
};
