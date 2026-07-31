import {
  buildCampaignWorkflow,
  validateWorkflowForScheduling,
} from './campaign_workflow';

describe('campaign workflow', () => {
  test('creates image and video jobs for each platform', () => {
    const workflow = buildCampaignWorkflow({
      id: 'veneer-7-days',
      topic: 'Tủ bếp gỗ veneer',
      platforms: ['facebook', 'tiktok', 'youtube'],
      mediaTypes: ['image', 'video'],
      publishAt: '2026-08-01T19:30:00+07:00',
      brand: {
        name: 'Đại Hải Phát',
        phone: '0900000000',
      },
    });

    expect(workflow.channels).toHaveLength(3);
    expect(workflow.channels[0].jobs).toHaveLength(2);
    expect(workflow.channels[1].jobs[1].output.aspectRatio).toBe('9:16');
    expect(workflow.channels[2].jobs[1].output.aspectRatio).toBe('9:16');
    expect(workflow.channels[0].jobs[0].idempotencyKey).toContain('veneer-7-days');
  });

  test('removes duplicate platforms and media types', () => {
    const workflow = buildCampaignWorkflow({
      topic: 'Cổng sắt sơn tĩnh điện',
      platforms: ['facebook', 'Facebook'],
      mediaTypes: ['image', 'image'],
    });

    expect(workflow.channels).toHaveLength(1);
    expect(workflow.channels[0].jobs).toHaveLength(1);
  });

  test('rejects unknown platforms', () => {
    expect(() => buildCampaignWorkflow({
      topic: 'Nội thất',
      platforms: ['unknown-network'],
    })).toThrow('Nền tảng không được hỗ trợ');
  });

  test('requires topic and platform', () => {
    expect(() => buildCampaignWorkflow({ platforms: ['facebook'] }))
      .toThrow('Chiến dịch phải có chủ đề');

    expect(() => buildCampaignWorkflow({ topic: 'Nội thất', platforms: [] }))
      .toThrow('ít nhất một nền tảng');
  });

  test('validates scheduling requirements', () => {
    const workflow = buildCampaignWorkflow({
      id: 'campaign-no-time',
      topic: 'Lan can kính',
      platforms: ['facebook'],
      mediaTypes: ['image'],
    });

    const invalidResult = validateWorkflowForScheduling(workflow);
    expect(invalidResult.valid).toBe(false);
    expect(invalidResult.errors[0]).toContain('chưa có thời gian đăng');

    workflow.channels[0].jobs[0].publishAt = '2026-08-02T19:30:00+07:00';
    const validResult = validateWorkflowForScheduling(workflow);
    expect(validResult).toEqual({ valid: true, errors: [] });
  });
});
