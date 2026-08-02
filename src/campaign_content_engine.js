import { generateTemplatePost } from './content_generator';

const PLATFORM_RULES = Object.freeze({
  facebook: { tone: 'friendly', length: 'medium', emojiLevel: 'light', hashtagCount: 4 },
  instagram: { tone: 'friendly', length: 'short', emojiLevel: 'heavy', hashtagCount: 8 },
  tiktok: { tone: 'urgent', length: 'short', emojiLevel: 'heavy', hashtagCount: 5 },
  youtube: { tone: 'neutral', length: 'medium', emojiLevel: 'light', hashtagCount: 4 },
  pinterest: { tone: 'neutral', length: 'short', emojiLevel: 'light', hashtagCount: 6 },
  linkedin: { tone: 'neutral', length: 'long', emojiLevel: 'none', hashtagCount: 3 },
  zalo: { tone: 'friendly', length: 'medium', emojiLevel: 'light', hashtagCount: 3 },
});

const DOMAIN_HASHTAGS = Object.freeze({
  interior: ['noithat', 'tubep', 'khonggiansong', 'thietkenoithat'],
  civil_mechanical: ['cokhi', 'congsat', 'maiche', 'cokhidandung'],
  general: ['giaiphap', 'chatluong', 'tuvan', 'uytin'],
});

function normalizeHashtags(values, count) {
  return [...new Set(values.map((value) => String(value).trim().replace(/^#/, '').toLowerCase()).filter(Boolean))]
    .slice(0, count);
}

function buildPlatformTopic(workflow, platform) {
  const topic = workflow.campaign.topic;
  const audience = workflow.campaign.audience;
  const goal = workflow.campaign.goal;
  return `${topic}. Nội dung dành cho ${audience}, tối ưu cho ${platform}, mục tiêu ${goal}`;
}

export function generateCampaignContent(workflow, options = {}) {
  if (!workflow?.campaign?.id || !Array.isArray(workflow?.channels)) {
    throw new Error('Workflow không hợp lệ để tạo nội dung.');
  }

  const domain = workflow.campaign.domain || 'general';
  const baseHashtags = DOMAIN_HASHTAGS[domain] || DOMAIN_HASHTAGS.general;

  const channels = workflow.channels.map((channel) => {
    const rules = PLATFORM_RULES[channel.platform] || PLATFORM_RULES.facebook;
    const hashtags = normalizeHashtags(
      [...baseHashtags, channel.platform, ...(options.hashtags || [])],
      rules.hashtagCount,
    );
    const content = generateTemplatePost(
      buildPlatformTopic(workflow, channel.platform),
      {
        tone: options.tone || rules.tone,
        length: options.length || rules.length,
        emojiLevel: options.emojiLevel || rules.emojiLevel,
        hashtags,
        cta: options.cta || '',
      },
    );

    return {
      ...channel,
      contentStatus: 'generated',
      content: {
        text: content,
        hashtags,
        platform: channel.platform,
        generatedAt: new Date().toISOString(),
        source: 'template',
      },
    };
  });

  return {
    ...workflow,
    channels,
    contentGeneratedAt: new Date().toISOString(),
  };
}

export { PLATFORM_RULES };
