import { executeCampaignRun } from './campaign_orchestrator';

export const oneClickCampaignMetadata = Object.freeze({
  id: 'one-click-campaign',
  name: 'One-Click Campaign',
  version: '1.0.0',
  category: 'orchestration',
  description: 'Điều phối chiến dịch đa nền tảng từ một câu lệnh đến trạng thái chờ duyệt hoặc sẵn sàng.',
  entrypoint: 'src/campaign_orchestrator.js',
  dependencies: [
    'campaign-command-analyzer',
    'campaign-planner',
    'platform-content-generator',
    'media-job-planner',
    'campaign-readiness-validator',
    'campaign-storage',
  ],
  timeoutMs: 60000,
  retry: { maxAttempts: 2, backoffMs: 1000 },
  context: [
    'skills/context/brand-guideline.md',
    'skills/context/customer-persona.md',
    'skills/context/marketing-channels.md',
    'skills/context/product-catalog.md',
  ],
  inputSchema: 'input.schema.json',
  outputSchema: 'output.schema.json',
});

export const oneClickCampaignRuntime = Object.freeze({
  validate(input) {
    const errors = [];
    if (!String(input?.command || '').trim()) errors.push('Câu lệnh chiến dịch không được để trống.');
    if (input?.mode && !['review', 'automatic'].includes(input.mode)) {
      errors.push('Chế độ phải là review hoặc automatic.');
    }
    if (input?.publishAt && Number.isNaN(new Date(input.publishAt).getTime())) {
      errors.push('Thời gian đăng không hợp lệ.');
    }
    return { valid: errors.length === 0, errors };
  },

  execute(input, context = {}) {
    return executeCampaignRun(
      input.command,
      {
        mode: input.mode || 'review',
        platforms: input.platforms,
        mediaTypes: input.mediaTypes,
        publishAt: input.publishAt,
        timezone: input.timezone,
        brand: input.brand,
        runId: input.runId,
      },
      context.onProgress || (() => {}),
    );
  },
});
