import { generateCampaignContent } from './campaign_content_engine';

const workflow = {
  campaign: {
    id: 'campaign-1',
    topic: 'Tủ bếp veneer',
    audience: 'gia đình trẻ',
    goal: 'lead_generation',
    domain: 'interior',
  },
  channels: [
    { platform: 'facebook', contentStatus: 'awaiting_generation', jobs: [] },
    { platform: 'linkedin', contentStatus: 'awaiting_generation', jobs: [] },
  ],
};

describe('campaign content engine', () => {
  test('creates one platform-specific content record per channel', () => {
    const result = generateCampaignContent(workflow);

    expect(result.channels).toHaveLength(2);
    expect(result.channels.every((channel) => channel.contentStatus === 'generated')).toBe(true);
    expect(result.channels.every((channel) => channel.content.text.length > 0)).toBe(true);
    expect(result.channels[0].content.platform).toBe('facebook');
    expect(result.channels[1].content.platform).toBe('linkedin');
  });

  test('adds domain and platform hashtags without duplicates', () => {
    const result = generateCampaignContent(workflow, {
      hashtags: ['NoiThat', '#facebook', 'noithat'],
    });
    const facebook = result.channels.find((channel) => channel.platform === 'facebook');

    expect(facebook.content.hashtags).toContain('noithat');
    expect(facebook.content.hashtags).toContain('facebook');
    expect(new Set(facebook.content.hashtags).size).toBe(facebook.content.hashtags.length);
  });

  test('rejects malformed workflows', () => {
    expect(() => generateCampaignContent({ channels: [] })).toThrow('không hợp lệ');
  });
});
