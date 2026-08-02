import {
  CAMPAIGN_RUN_STATUS,
  createCampaignRun,
  executeCampaignRun,
} from './campaign_orchestrator';

jest.mock('./campaign_storage', () => ({
  saveCampaignWorkflow: jest.fn((workflow) => ({
    ...workflow,
    savedAt: '2026-08-02T00:00:00.000Z',
  })),
}));

describe('campaign orchestrator', () => {
  test('creates a normalized campaign run', () => {
    const run = createCampaignRun('  Tạo bài Facebook về tủ bếp  ');

    expect(run.command).toBe('Tạo bài Facebook về tủ bếp');
    expect(run.status).toBe(CAMPAIGN_RUN_STATUS.CREATED);
    expect(run.steps).toHaveLength(6);
  });

  test('rejects an empty command', () => {
    expect(() => createCampaignRun('   ')).toThrow('không được để trống');
  });

  test('runs review mode through every preparation step', async () => {
    const updates = [];
    const result = await executeCampaignRun(
      'Tạo chiến dịch Facebook có ảnh về tủ bếp',
      {
        publishAt: new Date(Date.now() + 60_000).toISOString(),
        mode: 'review',
      },
      (run) => updates.push(run.status),
    );

    expect(result.status).toBe(CAMPAIGN_RUN_STATUS.WAITING_APPROVAL);
    expect(result.workflow.orchestrator.runId).toBe(result.runId);
    expect(result.steps.every((step) => step.status === 'completed')).toBe(true);
    expect(updates).toContain(CAMPAIGN_RUN_STATUS.ANALYZING);
    expect(updates).toContain(CAMPAIGN_RUN_STATUS.VALIDATING);
  });

  test('marks a valid automatic campaign as ready', async () => {
    const result = await executeCampaignRun(
      'Tạo video TikTok về cổng sắt dân dụng',
      {
        publishAt: new Date(Date.now() + 60_000).toISOString(),
        mode: 'automatic',
      },
    );

    expect(result.status).toBe(CAMPAIGN_RUN_STATUS.READY);
    expect(result.readiness.ready).toBe(true);
    expect(result.workflow.workflowStatus).toBe('approved');
  });

  test('returns failed run context when scheduling data is missing', async () => {
    await expect(executeCampaignRun('Tạo bài Facebook về nội thất'))
      .rejects.toMatchObject({
        campaignRun: expect.objectContaining({
          status: CAMPAIGN_RUN_STATUS.FAILED,
        }),
      });
  });
});
