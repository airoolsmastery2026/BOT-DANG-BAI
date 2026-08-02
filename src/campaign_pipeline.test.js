import { analyzeCampaignCommand } from './campaign_command_analyzer';
import { createCampaignFromCommand, evaluateCampaignReadiness } from './campaign_pipeline';

describe('campaign command pipeline', () => {
  test('detects an interior campaign and requested channels', () => {
    const analysis = analyzeCampaignCommand(
      'Tạo chiến dịch 7 ngày về tủ bếp veneer, đăng Facebook và TikTok, tạo ảnh và video',
    );

    expect(analysis.domain.id).toBe('interior');
    expect(analysis.durationDays).toBe(7);
    expect(analysis.suggestedPlatforms).toEqual(['facebook', 'tiktok']);
    expect(analysis.suggestedMediaTypes).toEqual(['image', 'video']);
  });

  test('builds a workflow from a simple Vietnamese command', () => {
    const workflow = createCampaignFromCommand(
      'Tạo video TikTok về cổng sắt dân dụng trong 5 ngày',
      { publishAt: new Date(Date.now() + 60_000).toISOString() },
    );

    expect(workflow.campaign.domain.id).toBe('construction');
    expect(workflow.campaign.durationDays).toBe(5);
    expect(workflow.channels.map((channel) => channel.platform)).toEqual(['tiktok']);
    expect(workflow.channels[0].jobs[0].type).toBe('video');
  });

  test('lets explicit selections override inferred selections', () => {
    const workflow = createCampaignFromCommand('Tạo bài Facebook về nội thất', {
      platforms: ['linkedin'],
      mediaTypes: ['image'],
      publishAt: new Date(Date.now() + 60_000).toISOString(),
    });

    expect(workflow.channels.map((channel) => channel.platform)).toEqual(['linkedin']);
  });

  test('reports readiness errors when publish time is missing', () => {
    const workflow = createCampaignFromCommand('Tạo bài Facebook về tủ bếp');
    const readiness = evaluateCampaignReadiness(workflow);

    expect(readiness.ready).toBe(false);
    expect(readiness.errors.join(' ')).toContain('chưa có thời gian đăng');
  });
});
