import { buildCampaignWorkflow } from './campaign_workflow';
import { generateCampaignContent } from './campaign_content_engine';
import {
  enrichWorkflowMediaPrompts,
  inspectMediaPromptReadiness,
} from './campaign_media_prompt_engine';

const PLATFORMS = ['facebook', 'tiktok', 'youtube', 'zalo', 'linkedin', 'pinterest'];

const buildWorkflow = (mediaTypes = ['image', 'video']) => {
  const workflow = buildCampaignWorkflow({
    id: 'campaign-media-test',
    topic: 'Tủ bếp veneer hiện đại',
    platforms: PLATFORMS,
    mediaTypes,
    publishAt: '2026-08-11T12:30:00.000Z',
    goal: 'lead_generation',
    audience: 'gia đình đang hoàn thiện nhà',
    tone: 'professional',
    brand: { name: 'Đại Hải Phát', style: 'premium minimal' },
  });
  return generateCampaignContent(workflow);
};

describe('campaign media prompt engine', () => {
  test('fills image prompts and text-ready render inputs for all phase-one platforms', () => {
    const enriched = enrichWorkflowMediaPrompts(buildWorkflow(['image']));

    PLATFORMS.forEach((platform) => {
      const channel = enriched.channels.find((item) => item.platform === platform);
      const image = channel.jobs.find((job) => job.type === 'image');
      expect(image.status).toBe('prompt_ready');
      expect(image.prompt.prompt).toContain('Tủ bếp veneer hiện đại');
      expect(image.prompt.prompt).toContain(`Platform: ${platform}`);
      expect(image.prompt.aspectRatio).toBeTruthy();
      expect(image.prompt.negativePrompt).toContain('no watermarks');
      expect(image.renderInput.headline).toBeTruthy();
      expect(image.renderInput.cta).toBeTruthy();
    });

    expect(inspectMediaPromptReadiness(enriched)).toEqual({ ready: true, errors: [] });
  });

  test('fills every storyboard scene with visual, voice and on-screen direction', () => {
    const enriched = enrichWorkflowMediaPrompts(buildWorkflow(['video']));

    PLATFORMS.forEach((platform) => {
      const channel = enriched.channels.find((item) => item.platform === platform);
      const video = channel.jobs.find((job) => job.type === 'video');
      expect(video.status).toBe('storyboard_ready');
      expect(video.output.aspectRatio).toBeTruthy();
      expect(video.storyboard.length).toBeGreaterThan(1);
      video.storyboard.forEach((scene, index) => {
        expect(scene.sceneNumber).toBe(index + 1);
        expect(scene.visualPrompt).toContain(`Aspect ratio ${video.output.aspectRatio}`);
        expect(scene.voiceOver.length).toBeGreaterThan(0);
        expect(scene.onScreenText.length).toBeGreaterThan(0);
      });
    });

    expect(inspectMediaPromptReadiness(enriched).ready).toBe(true);
  });

  test('uses platform-native ratios from media profiles', () => {
    const enriched = enrichWorkflowMediaPrompts(buildWorkflow());
    const expected = {
      facebook: { image: '4:5', video: '9:16' },
      tiktok: { image: '9:16', video: '9:16' },
      youtube: { image: '16:9', video: '9:16' },
      zalo: { image: '4:5', video: '9:16' },
      linkedin: { image: '4:5', video: '16:9' },
      pinterest: { image: '2:3', video: '9:16' },
    };

    Object.entries(expected).forEach(([platform, ratios]) => {
      const channel = enriched.channels.find((item) => item.platform === platform);
      expect(channel.jobs.find((job) => job.type === 'image').prompt.aspectRatio).toBe(ratios.image);
      expect(channel.jobs.find((job) => job.type === 'video').output.aspectRatio).toBe(ratios.video);
    });
  });

  test('detects blank media prompts before scheduling', () => {
    const workflow = buildWorkflow(['video']);
    const report = inspectMediaPromptReadiness(workflow);
    expect(report.ready).toBe(false);
    expect(report.errors.some((error) => error.includes('visual prompt'))).toBe(true);
  });
});
