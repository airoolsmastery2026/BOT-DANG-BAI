const PLATFORM_STYLE = Object.freeze({
  facebook: {
    visual: 'clean commercial social ad, natural lifestyle context, readable composition',
    cta: 'Xem chi tiết và nhắn tin để được tư vấn.',
  },
  instagram: {
    visual: 'premium editorial product photography, aspirational lifestyle, polished social aesthetic',
    cta: 'Lưu mẫu này và nhắn tin để được tư vấn.',
  },
  tiktok: {
    visual: 'dynamic vertical short-form video, fast visual hook, authentic handheld details',
    cta: 'Theo dõi và nhắn tin nếu bạn muốn xem phương án phù hợp.',
  },
  youtube: {
    visual: 'cinematic product demonstration, clear before-detail-result progression, high visual clarity',
    cta: 'Đăng ký kênh và liên hệ để được tư vấn chi tiết.',
  },
  linkedin: {
    visual: 'professional case-study photography, precise workmanship, credible business presentation',
    cta: 'Trao đổi với chúng tôi để nhận phương án phù hợp.',
  },
  zalo: {
    visual: 'clear Vietnamese business promotional visual, product-first composition, practical details',
    cta: 'Nhắn Zalo để được tư vấn nhanh.',
  },
  pinterest: {
    visual: 'inspirational vertical design reference, premium catalog styling, save-worthy composition',
    cta: 'Lưu ý tưởng này cho công trình của bạn.',
  },
});

const DEFAULT_STYLE = Object.freeze({
  visual: 'clean professional commercial visual, realistic materials, clear composition',
  cta: 'Liên hệ để được tư vấn chi tiết.',
});

const clean = (value) => String(value || '').trim();
const platformStyle = (platform) => PLATFORM_STYLE[platform] || DEFAULT_STYLE;

const brandDescription = (brand = {}) => [
  clean(brand.name),
  clean(brand.style),
  clean(brand.primaryColor) ? `brand color ${clean(brand.primaryColor)}` : '',
].filter(Boolean).join(', ');

const negativePrompt = () => [
  'no distorted geometry',
  'no fake logos',
  'no unreadable text',
  'no extra fingers or people unless requested',
  'no watermarks',
  'no unrealistic material texture',
  'no fabricated certificates or prices',
].join(', ');

function buildImagePrompt({ campaign, platform, job, channel }) {
  const style = platformStyle(platform);
  const topic = clean(campaign.topic);
  const audience = clean(campaign.audience);
  const goal = clean(campaign.goal);
  const tone = clean(campaign.tone);
  const brand = brandDescription(campaign.brand);
  const aspectRatio = clean(job.output?.aspectRatio || job.promptInput?.aspectRatio);
  const contentHook = clean(channel.content?.hook || channel.content?.title || '');

  const prompt = [
    `Create a realistic commercial image about: ${topic}.`,
    `Platform: ${platform}. Aspect ratio: ${aspectRatio || 'platform-native'}.`,
    `Visual direction: ${style.visual}.`,
    audience ? `Target audience: ${audience}.` : '',
    goal ? `Marketing goal: ${goal}.` : '',
    tone ? `Tone: ${tone}.` : '',
    brand ? `Brand direction: ${brand}.` : '',
    contentHook ? `Visual should support this hook: ${contentHook}.` : '',
    'Keep the main subject fully visible, materials realistic, lighting natural and text-safe areas uncluttered.',
    'Do not invent project facts, prices, awards, certifications or customer claims.',
  ].filter(Boolean).join(' ');

  return {
    prompt,
    negativePrompt: negativePrompt(),
    aspectRatio: aspectRatio || null,
    composition: platform === 'pinterest'
      ? 'vertical subject-first composition with clear upper and lower text-safe zones'
      : platform === 'tiktok' || platform === 'instagram'
        ? 'mobile-first composition, subject centered with safe margins for interface overlays'
        : 'balanced commercial composition with a clear focal point and text-safe negative space',
    textSafeArea: platform === 'tiktok'
      ? 'keep key subject and text away from top 12%, bottom 20% and right 15%'
      : 'keep headline and CTA inside central safe margins',
  };
}

function scenePurpose(sceneType, sceneNumber, totalScenes) {
  if (sceneType === 'hook' || sceneNumber === 1) return 'Hook immediately with the strongest visual detail or customer problem.';
  if (sceneType === 'cta' || sceneNumber === totalScenes) return 'Finish with the completed result and a clear next action.';
  if (sceneType === 'problem') return 'Show the practical problem clearly without exaggeration.';
  if (sceneType === 'solution') return 'Show the solution, workmanship or product feature in action.';
  if (sceneType === 'proof') return 'Show credible detail, material, process or result as visual evidence.';
  return 'Advance the story with one clear visual idea and no unnecessary elements.';
}

function buildVideoScene({ campaign, platform, job, channel, scene, index }) {
  const style = platformStyle(platform);
  const topic = clean(campaign.topic);
  const aspectRatio = clean(job.output?.aspectRatio || job.promptInput?.aspectRatio);
  const totalScenes = job.storyboard.length;
  const sceneNumber = index + 1;
  const purpose = scenePurpose(scene.type, sceneNumber, totalScenes);
  const content = clean(channel.content?.text);
  const cta = clean(channel.content?.cta) || style.cta;

  const visualPrompt = [
    `Scene ${sceneNumber}/${totalScenes} for a ${platform} video about ${topic}.`,
    `Aspect ratio ${aspectRatio || 'platform-native'}.`,
    `Style: ${style.visual}.`,
    purpose,
    'Realistic materials, natural motion, credible construction/interior details, no fake labels or claims.',
  ].join(' ');

  let voiceOver;
  if (sceneNumber === 1) {
    voiceOver = clean(channel.content?.hook) || `Bạn đang tìm một phương án phù hợp cho ${topic}?`;
  } else if (sceneNumber === totalScenes) {
    voiceOver = cta;
  } else {
    const shortContent = content.split(/[.!?]/).map((part) => part.trim()).filter(Boolean);
    voiceOver = shortContent[(sceneNumber - 2) % Math.max(shortContent.length, 1)]
      || `Đây là một chi tiết đáng chú ý của ${topic}.`;
  }

  return {
    ...scene,
    sceneNumber,
    visualPrompt,
    voiceOver,
    onScreenText: sceneNumber === 1
      ? (clean(channel.content?.title) || topic).slice(0, 90)
      : sceneNumber === totalScenes
        ? cta.slice(0, 90)
        : `${topic} · Chi tiết ${sceneNumber}`.slice(0, 90),
    transition: sceneNumber === 1 ? 'none' : clean(scene.transition) || 'cut',
  };
}

function enrichJob(campaign, channel, job) {
  if (job.type === 'image') {
    const generated = buildImagePrompt({ campaign, platform: channel.platform, job, channel });
    return {
      ...job,
      status: 'prompt_ready',
      prompt: generated,
      renderInput: {
        ...job.renderInput,
        headline: clean(job.renderInput?.headline) || clean(channel.content?.title) || clean(campaign.topic),
        subheadline: clean(job.renderInput?.subheadline) || clean(channel.content?.hook),
        cta: clean(job.renderInput?.cta) || clean(channel.content?.cta) || platformStyle(channel.platform).cta,
      },
    };
  }

  if (job.type === 'video' && Array.isArray(job.storyboard)) {
    return {
      ...job,
      status: 'storyboard_ready',
      storyboard: job.storyboard.map((scene, index) => buildVideoScene({
        campaign,
        platform: channel.platform,
        job,
        channel,
        scene,
        index,
      })),
    };
  }

  return job;
}

export function enrichWorkflowMediaPrompts(workflow) {
  if (!workflow?.campaign || !Array.isArray(workflow.channels)) {
    throw new Error('Workflow media không hợp lệ.');
  }

  return {
    ...workflow,
    channels: workflow.channels.map((channel) => ({
      ...channel,
      jobs: Array.isArray(channel.jobs)
        ? channel.jobs.map((job) => enrichJob(workflow.campaign, channel, job))
        : [],
    })),
  };
}

export function inspectMediaPromptReadiness(workflow) {
  const errors = [];

  workflow?.channels?.forEach((channel) => {
    (channel.jobs || []).forEach((job) => {
      if (job.type === 'image') {
        if (!clean(job.prompt?.prompt)) errors.push(`${channel.platform}/image: thiếu prompt hình ảnh.`);
        if (!clean(job.prompt?.aspectRatio)) errors.push(`${channel.platform}/image: thiếu aspect ratio.`);
        if (!clean(job.renderInput?.headline)) errors.push(`${channel.platform}/image: thiếu headline render.`);
      }

      if (job.type === 'video') {
        if (!Array.isArray(job.storyboard) || job.storyboard.length === 0) {
          errors.push(`${channel.platform}/video: thiếu storyboard.`);
          return;
        }
        job.storyboard.forEach((scene) => {
          if (!clean(scene.visualPrompt)) errors.push(`${channel.platform}/video scene ${scene.sceneNumber}: thiếu visual prompt.`);
          if (!clean(scene.voiceOver)) errors.push(`${channel.platform}/video scene ${scene.sceneNumber}: thiếu voice over.`);
          if (!clean(scene.onScreenText)) errors.push(`${channel.platform}/video scene ${scene.sceneNumber}: thiếu on-screen text.`);
        });
      }
    });
  });

  return {
    ready: errors.length === 0,
    errors: [...new Set(errors)],
  };
}
