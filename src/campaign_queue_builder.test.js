import { buildCampaignQueueEntries } from './campaign_queue_builder';

const workflow = {
  campaign: { id: 'campaign-1', topic: 'Tủ bếp veneer' },
  workflowStatus: 'approved',
  schedulePlan: {
    slots: [
      { publishAt: '2026-08-03T01:00:00.000Z' },
      { publishAt: '2026-08-04T01:00:00.000Z' },
    ],
  },
  channels: [
    { platform: 'facebook', content: { text: 'Bài Facebook' } },
    { platform: 'tiktok', content: { text: 'Bài TikTok' } },
    { platform: 'linkedin', content: { text: 'Bài LinkedIn' } },
  ],
};

describe('campaign queue builder', () => {
  test('creates one queue entry for each supported platform and schedule slot', () => {
    const plan = buildCampaignQueueEntries(workflow);

    expect(plan.entries).toHaveLength(4);
    expect(plan.slotCount).toBe(2);
    expect(plan.platformCount).toBe(2);
    expect(plan.skippedPlatforms).toEqual(['linkedin']);
    expect(plan.entries[0].campaignId).toBe('campaign-1');
  });

  test('filters to explicitly enabled platforms', () => {
    const plan = buildCampaignQueueEntries(workflow, { platforms: ['facebook'] });

    expect(plan.entries).toHaveLength(2);
    expect(plan.entries.every((entry) => entry.platforms[0] === 'facebook')).toBe(true);
  });

  test('requires approved workflow', () => {
    expect(() => buildCampaignQueueEntries({ ...workflow, workflowStatus: 'draft' }))
      .toThrow('phải được duyệt');
  });

  test('requires valid schedule slots', () => {
    expect(() => buildCampaignQueueEntries({ ...workflow, schedulePlan: { slots: [] } }))
      .toThrow('chưa có lịch');
  });

  test('uses campaign topic when a channel has no generated content', () => {
    const plan = buildCampaignQueueEntries({
      ...workflow,
      channels: [{ platform: 'facebook', content: null }],
    });

    expect(plan.entries[0].content).toBe('Tủ bếp veneer');
  });
});
