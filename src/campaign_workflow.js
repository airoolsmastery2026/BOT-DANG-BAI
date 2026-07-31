import {
  getImageTemplate,
  getPlatformMediaProfile,
  getVideoTemplate,
} from './media_templates';

const DEFAULT_TIMEZONE = 'Asia/Ho_Chi_Minh';
const SUPPORTED_MEDIA_TYPES = new Set(['image', 'video']);

function normalizePlatforms(platforms) {
  if (!Array.isArray(platforms) || platforms.length === 0) {
    throw new Error('Chiến dịch phải có ít nhất một nền tảng.');
  }

  return [...new Set(platforms.map((platform) => String(platform).trim().toLowerCase()))];
}

function normalizeMediaTypes(mediaTypes) {
  const normalized = Array.isArray(mediaTypes) && mediaTypes.length > 0
    ? mediaTypes.map((type) => String(type).trim().toLowerCase())
    : ['image'];

  normalized.forEach((type) => {
    if (!SUPPORTED_MEDIA_TYPES.has(type)) {
      throw new Error(`Loại media không được hỗ trợ: ${type}`);
    }
  });

  return [...new Set(normalized)];
}

function createIdempotencyKey(campaignId, platform, publishAt, mediaType) {
  return [campaignId, platform, publishAt, mediaType].join(':');
}

function buildImageJob({ campaign, platform, publishAt }) {
  const template = getImageTemplate(campaign.imageTemplateId || 'premium_product');
  const profile = getPlatformMediaProfile(platform);
  const output = profile.portrait || profile.image;

  return {
    type: 'image',
    status: 'generated',
    templateId: template.id,
    output,
    promptInput: {
      topic: campaign.topic,
      goal: campaign.goal,
      audience: campaign.audience,
      tone: campaign.tone,
      platform,
      aspectRatio: output.aspectRatio,
      brand: campaign.brand || {},
    },
    renderInput: {
      headline: '',
      subheadline: '',
      cta: '',
      productImage: '',
      logo: campaign.brand?.logo || '',
      phone: campaign.brand?.phone || '',
    },
    publishAt,
    idempotencyKey: createIdempotencyKey(campaign.id, platform, publishAt, 'image'),
  };
}

function buildVideoJob({ campaign, platform, publishAt }) {
  const template = getVideoTemplate(campaign.videoTemplateId || 'short_sales');
  const profile = getPlatformMediaProfile(platform);
  const output = platform === 'youtube' && profile.short ? profile.short : profile.video;

  return {
    type: 'video',
    status: 'generated',
    templateId: template.id,
    output,
    storyboard: template.scenes.map((scene, index) => ({
      sceneNumber: index + 1,
      type: scene.type,
      durationSeconds: scene.durationSeconds,
      visualPrompt: '',
      voiceOver: '',
      onScreenText: '',
      transition: index === 0 ? 'none' : 'fade',
    })),
    promptInput: {
      topic: campaign.topic,
      goal: campaign.goal,
      audience: campaign.audience,
      tone: campaign.tone,
      platform,
      aspectRatio: output.aspectRatio,
      brand: campaign.brand || {},
    },
    publishAt,
    idempotencyKey: createIdempotencyKey(campaign.id, platform, publishAt, 'video'),
  };
}

export function buildCampaignWorkflow(input) {
  const platforms = normalizePlatforms(input.platforms);
  const mediaTypes = normalizeMediaTypes(input.mediaTypes);
  const campaignId = String(input.id || `campaign-${Date.now()}`);
  const publishAt = input.publishAt || null;

  if (!String(input.topic || '').trim()) {
    throw new Error('Chiến dịch phải có chủ đề.');
  }

  const campaign = {
    id: campaignId,
    topic: String(input.topic).trim(),
    goal: input.goal || 'engagement',
    audience: input.audience || 'khách hàng tiềm năng',
    tone: input.tone || 'professional',
    timezone: input.timezone || DEFAULT_TIMEZONE,
    approvalMode: input.approvalMode || 'review',
    imageTemplateId: input.imageTemplateId || 'premium_product',
    videoTemplateId: input.videoTemplateId || 'short_sales',
    brand: input.brand || {},
  };

  const channels = platforms.map((platform) => {
    const profile = getPlatformMediaProfile(platform);
    const jobs = mediaTypes.map((mediaType) => (
      mediaType === 'image'
        ? buildImageJob({ campaign, platform, publishAt })
        : buildVideoJob({ campaign, platform, publishAt })
    ));

    return {
      platform,
      profile,
      contentStatus: 'awaiting_generation',
      jobs,
    };
  });

  return {
    schemaVersion: 1,
    campaign,
    workflowStatus: 'draft',
    createdAt: new Date().toISOString(),
    channels,
  };
}

export function validateWorkflowForScheduling(workflow) {
  const errors = [];

  if (!workflow?.campaign?.id) {
    errors.push('Thiếu campaign ID.');
  }

  if (!Array.isArray(workflow?.channels) || workflow.channels.length === 0) {
    errors.push('Workflow chưa có kênh đăng.');
  }

  workflow?.channels?.forEach((channel) => {
    channel.jobs?.forEach((job) => {
      if (!job.publishAt) {
        errors.push(`${channel.platform}/${job.type}: chưa có thời gian đăng.`);
      }
      if (!job.idempotencyKey) {
        errors.push(`${channel.platform}/${job.type}: thiếu idempotency key.`);
      }
    });
  });

  return {
    valid: errors.length === 0,
    errors,
  };
}
