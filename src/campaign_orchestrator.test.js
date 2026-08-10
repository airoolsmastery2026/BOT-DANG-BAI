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
    expect(run.metrics).toEqual({});
  });

  test('rejects an empty command', () => {
    expect(() => createCampaignRun('   ')).toThrow('không được để trống');
  });

  test('runs review mode through content and image prompt generation', async () => {
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
    expect(result.workflow.channels[0].contentStatus).toBe('generated');
    expect(result.workflow.channels[0].content.text.length).toBeGreaterThan(0);
    const image = result.workflow.channels[0].jobs.find((job) => job.type === 'image');
    expect(image.status).toBe('prompt_ready');
    expect(image.prompt.prompt.length).toBeGreaterThan(40);
    expect(image.prompt.aspectRatio).toBeTruthy();
    expect(result.metrics.generatedContentCount).toBe(result.workflow.channels.length);
    expect(result.metrics.imagePromptCount).toBe(1);
    expect(result.metrics.contentWordCount).toBeGreaterThan(0);
    expect(result.readiness.media.ready).toBe(true);
    expect(updates).toContain(CAMPAIGN_RUN_STATUS.ANALYZING);
    expect(updates).toContain(CAMPAIGN_RUN_STATUS.GENERATING_CONTENT);
    expect(updates).toContain(CAMPAIGN_RUN_STATUS.GENERATING_MEDIA);
    expect(updates).toContain(CAMPAIGN_RUN_STATUS.VALIDATING);
  });

  test('marks a valid automatic video campaign as ready with complete storyboard', async () => {
    const result = await executeCampaignRun(
      'Tạo video TikTok về cổng sắt dân dụng',
      {
        publishAt: new Date(Date.now() + 60_000).toISOString(),
        mode: 'automatic',
      },
    );

    expect(result.status).toBe(CAMPAIGN_RUN_STATUS.READY);
    expect(result.readiness.ready).toBe(true);
    expect(result.readiness.media.ready).toBe(true);
    expect(result.workflow.workflowStatus).toBe('approved');
    expect(result.workflow.channels[0].content.platform).toBe('tiktok');
    const video = result.workflow.channels[0].jobs.find((job) => job.type === 'video');
    expect(video.status).toBe('storyboard_ready');
    expect(video.storyboard.every((scene) => (
      scene.visualPrompt && scene.voiceOver && scene.onScreenText
    ))).toBe(true);
    expect(result.metrics.storyboardSceneCount).toBe(video.storyboard.length);
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
