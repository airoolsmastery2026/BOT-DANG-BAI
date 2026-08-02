import { analyzeCampaignCommand } from './campaign_command_analyzer';
import { buildCampaignWorkflow, validateWorkflowForScheduling } from './campaign_workflow';

function chooseValues(explicitValues, suggestedValues, fallback) {
  if (Array.isArray(explicitValues) && explicitValues.length) return explicitValues;
  if (Array.isArray(suggestedValues) && suggestedValues.length) return suggestedValues;
  return fallback;
}

export function createCampaignFromCommand(command, overrides = {}) {
  const analysis = analyzeCampaignCommand(command);
  const platforms = chooseValues(overrides.platforms, analysis.suggestedPlatforms, ['facebook']);
  const mediaTypes = chooseValues(overrides.mediaTypes, analysis.suggestedMediaTypes, ['image']);

  const workflow = buildCampaignWorkflow({
    id: overrides.id,
    topic: analysis.topic,
    platforms,
    mediaTypes,
    publishAt: overrides.publishAt || null,
    timezone: overrides.timezone || 'Asia/Ho_Chi_Minh',
    approvalMode: overrides.approvalMode || 'review',
    goal: overrides.goal || analysis.goal,
    audience: overrides.audience || analysis.audience,
    tone: overrides.tone || analysis.tone,
    imageTemplateId: overrides.imageTemplateId,
    videoTemplateId: overrides.videoTemplateId,
    brand: overrides.brand || {},
  });

  return {
    ...workflow,
    campaign: {
      ...workflow.campaign,
      domain: analysis.domain,
      durationDays: overrides.durationDays || analysis.durationDays,
      commandAnalysis: {
        suggestedPlatforms: analysis.suggestedPlatforms,
        suggestedMediaTypes: analysis.suggestedMediaTypes,
      },
    },
  };
}

export function evaluateCampaignReadiness(workflow) {
  const scheduling = validateWorkflowForScheduling(workflow);
  const warnings = [];

  if (workflow?.campaign?.approvalMode !== 'review') {
    warnings.push('Chiến dịch không ở chế độ duyệt thủ công.');
  }

  const mediaJobs = workflow?.channels?.flatMap((channel) => channel.jobs || []) || [];
  if (mediaJobs.some((job) => job.type === 'image' && !job.renderInput)) {
    warnings.push('Có tác vụ ảnh chưa có render input.');
  }
  if (mediaJobs.some((job) => job.type === 'video' && !Array.isArray(job.storyboard))) {
    warnings.push('Có tác vụ video chưa có storyboard.');
  }

  return {
    ready: scheduling.valid && warnings.length === 0,
    errors: scheduling.errors,
    warnings,
  };
}
