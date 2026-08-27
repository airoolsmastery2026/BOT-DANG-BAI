import {
  SCHEDULER_HANDOFF_STORAGE_KEY,
  clearSchedulerHandoff,
  loadSchedulerHandoff,
  normalizeSchedulerHandoff,
} from './scheduler_handoff';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
}

describe('scheduler handoff', () => {
  test('normalizes an approved campaign handoff', () => {
    const handoff = normalizeSchedulerHandoff({
      campaignId: 'campaign-1',
      topic: 'Tủ bếp veneer',
      platforms: ['Facebook', 'facebook', 'linkedin', 'tiktok'],
      publishAt: '2026-08-03T12:30:00.000Z',
      workflow: {
        channels: [{ jobs: [{ type: 'image' }, { type: 'video' }] }],
      },
    });

    expect(handoff.platforms).toEqual(['facebook', 'linkedin', 'tiktok']);
    expect(handoff.hasImageJob).toBe(true);
    expect(handoff.hasVideoJob).toBe(true);
    expect(handoff.scheduleSlots).toEqual(['2026-08-03T12:30:00.000Z']);
  });

  test('preserves, sorts and deduplicates a full campaign schedule', () => {
    const handoff = normalizeSchedulerHandoff({
      campaignId: 'campaign-2',
      topic: 'Cổng sắt dân dụng',
      platforms: ['facebook'],
      workflow: {
        campaign: { durationDays: 2, postsPerDay: 2 },
        schedulePlan: {
          durationDays: 2,
          postsPerDay: 2,
          slots: [
            { publishAt: '2026-08-04T12:00:00.000Z' },
            { publishAt: '2026-08-03T00:00:00.000Z' },
            { publishAt: '2026-08-03T00:00:00.000Z' },
            { publishAt: 'invalid' },
          ],
        },
        channels: [],
      },
    });

    expect(handoff.scheduleSlots).toEqual([
      '2026-08-03T00:00:00.000Z',
      '2026-08-04T12:00:00.000Z',
    ]);
    expect(handoff.publishAt).toBe('2026-08-03T00:00:00.000Z');
    expect(handoff.scheduleSlotCount).toBe(2);
    expect(handoff.durationDays).toBe(2);
    expect(handoff.postsPerDay).toBe(2);
  });

  test('rejects incomplete handoff data', () => {
    expect(normalizeSchedulerHandoff({ topic: 'Thiếu ID', platforms: ['facebook'] })).toBeNull();
    expect(normalizeSchedulerHandoff({ campaignId: '1', topic: 'Không hỗ trợ', platforms: ['zalo'] })).toBeNull();
  });

  test('loads and clears storage safely', () => {
    const storage = createStorage();
    storage.setItem(SCHEDULER_HANDOFF_STORAGE_KEY, JSON.stringify({
      campaignId: 'campaign-3',
      topic: 'Cửa cổng sắt',
      platforms: ['facebook'],
    }));

    expect(loadSchedulerHandoff(storage)?.campaignId).toBe('campaign-3');
    expect(clearSchedulerHandoff(storage)).toBe(true);
    expect(loadSchedulerHandoff(storage)).toBeNull();
  });

  test('ignores malformed JSON', () => {
    const storage = createStorage();
    storage.setItem(SCHEDULER_HANDOFF_STORAGE_KEY, '{bad json');
    expect(loadSchedulerHandoff(storage)).toBeNull();
  });
});
