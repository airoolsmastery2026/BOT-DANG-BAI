import {
  attachScheduleToWorkflow,
  buildCampaignSchedule,
  evaluateScheduleConflicts,
} from './campaign_schedule_planner';

const START = '2026-08-02T12:00:00.000Z';

describe('campaign schedule planner', () => {
  test('builds one slot per day by default', () => {
    const schedule = buildCampaignSchedule({ startAt: START, durationDays: 3 });

    expect(schedule.valid).toBe(true);
    expect(schedule.slots).toHaveLength(3);
    expect(schedule.slots[1].dayNumber).toBe(2);
  });

  test('distributes multiple posts across each day', () => {
    const schedule = buildCampaignSchedule({
      startAt: START,
      durationDays: 2,
      postsPerDay: 2,
    });

    expect(schedule.slots).toHaveLength(4);
    expect(schedule.slots[1].sequenceInDay).toBe(2);
    expect(new Date(schedule.slots[1].publishAt).getTime()
      - new Date(schedule.slots[0].publishAt).getTime()).toBe(12 * 60 * 60 * 1000);
  });

  test('rejects a missing start time without throwing', () => {
    const schedule = buildCampaignSchedule({ durationDays: 7 });

    expect(schedule.valid).toBe(false);
    expect(schedule.errors[0]).toContain('thời gian bắt đầu');
  });

  test('attaches schedule metadata to a workflow', () => {
    const workflow = attachScheduleToWorkflow({
      campaign: { id: 'campaign-1', timezone: 'Asia/Ho_Chi_Minh' },
      channels: [{ jobs: [{ publishAt: START }] }],
    }, { durationDays: 5, postsPerDay: 1 });

    expect(workflow.schedulePlan.slots).toHaveLength(5);
    expect(workflow.campaign.durationDays).toBe(5);
  });

  test('detects time slots that are too close', () => {
    const result = evaluateScheduleConflicts({
      slots: [
        { publishAt: START },
        { publishAt: '2026-08-02T12:05:00.000Z' },
      ],
    }, 15);

    expect(result.valid).toBe(false);
    expect(result.conflicts).toHaveLength(1);
  });
});
