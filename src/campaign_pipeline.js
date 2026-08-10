import { analyzeCampaignCommand } from './campaign_command_analyzer';
import { inspectMediaPromptReadiness } from './campaign_media_prompt_engine';
import { attachScheduleToWorkflow, evaluateScheduleConflicts } from './campaign_schedule_planner';
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
  const durationDays = overrides.durationDays || analysis.durationDays;
  const postsPerDay = overrides.postsPerDay || analysis.postsPerDay || 1;

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

  return attachScheduleToWorkflow({
    ...workflow,
    campaign: {
      ...workflow.campaign,
      domain: analysis.domain,
      durationDays,
      postsPerDay,
      commandAnalysis: {
        suggestedPlatforms: analysis.suggestedPlatforms,
        suggestedMediaTypes: analysis.suggestedMediaTypes,
      },
    },
  }, {
    startAt: overrides.publishAt || null,
    durationDays,
    postsPerDay,
  });
}

export function evaluateCampaignReadiness(workflow) {
  const scheduling = validateWorkflowForScheduling(workflow);
  const warnings = [];
  const blockingErrors = [...scheduling.errors];
  const mediaJobs = workflow?.channels?.flatMap((channel) => channel.jobs || []) || [];
  const schedulePlan = workflow?.schedulePlan;
  const mediaReadiness = inspectMediaPromptReadiness(workflow);

  if (mediaJobs.some((job) => job.type === 'image' && !job.renderInput)) {
    blockingErrors.push('Có tác vụ ảnh chưa có render input.');
  }
  if (mediaJobs.some((job) => job.type === 'video' && !Array.isArray(job.storyboard))) {
    blockingErrors.push('Có tác vụ video chưa có storyboard.');
  }
  if (!mediaReadiness.ready) {
    blockingErrors.push(...mediaReadiness.errors);
  }
  if (!schedulePlan?.valid || !schedulePlan?.slots?.length) {
    blockingErrors.push(...(schedulePlan?.errors || ['Chiến dịch chưa có kế hoạch lịch đăng hợp lệ.']));
  } else {
    const conflictCheck = evaluateScheduleConflicts(schedulePlan);
    if (!conflictCheck.valid) blockingErrors.push('Kế hoạch lịch đăng có các mốc thời gian quá gần nhau.');
    if (schedulePlan.errors?.length) warnings.push(...schedulePlan.errors);
  }
  if (workflow?.campaign?.approvalMode === 'review') {
    warnings.push('Chiến dịch cần được duyệt trước khi đăng.');
  }

  return {
    ready: blockingErrors.length === 0,
    errors: [...new Set(blockingErrors)],
    warnings: [...new Set(warnings)],
    requiresApproval: workflow?.campaign?.approvalMode === 'review',
    media: mediaReadiness,
  };
}
