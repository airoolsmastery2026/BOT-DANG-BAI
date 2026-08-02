import { createCampaignFromCommand, evaluateCampaignReadiness } from './campaign_pipeline';
import { saveCampaignWorkflow } from './campaign_storage';

export const CAMPAIGN_RUN_STATUS = Object.freeze({
  CREATED: 'created',
  ANALYZING: 'analyzing',
  PLANNING: 'planning',
  GENERATING_CONTENT: 'generating_content',
  GENERATING_MEDIA: 'generating_media',
  VALIDATING: 'validating',
  WAITING_APPROVAL: 'waiting_approval',
  READY: 'ready',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
});

const STEP_LABELS = Object.freeze({
  analyze: 'Phân tích câu lệnh',
  plan: 'Lập kế hoạch chiến dịch',
  content: 'Chuẩn bị nội dung',
  media: 'Chuẩn bị tác vụ ảnh/video',
  validate: 'Kiểm tra điều kiện',
  persist: 'Lưu bản nháp',
});

function createRunId() {
  return `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function createStep(id) {
  return {
    id,
    label: STEP_LABELS[id],
    status: 'pending',
    startedAt: null,
    completedAt: null,
    error: null,
  };
}

function updateStep(steps, id, patch) {
  return steps.map((step) => (step.id === id ? { ...step, ...patch } : step));
}

export function createCampaignRun(command, options = {}) {
  const normalizedCommand = String(command || '').trim();
  if (!normalizedCommand) throw new Error('Câu lệnh chiến dịch không được để trống.');

  return {
    runId: options.runId || createRunId(),
    command: normalizedCommand,
    status: CAMPAIGN_RUN_STATUS.CREATED,
    mode: options.mode || 'review',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    workflow: null,
    readiness: null,
    error: null,
    steps: ['analyze', 'plan', 'content', 'media', 'validate', 'persist'].map(createStep),
  };
}

export async function executeCampaignRun(command, options = {}, onProgress = () => {}) {
  let run = createCampaignRun(command, options);

  const publishProgress = () => {
    run = { ...run, updatedAt: new Date().toISOString() };
    onProgress(run);
  };

  const startStep = (id, status) => {
    run = {
      ...run,
      status,
      steps: updateStep(run.steps, id, {
        status: 'running',
        startedAt: new Date().toISOString(),
        error: null,
      }),
    };
    publishProgress();
  };

  const completeStep = (id) => {
    run = {
      ...run,
      steps: updateStep(run.steps, id, {
        status: 'completed',
        completedAt: new Date().toISOString(),
      }),
    };
    publishProgress();
  };

  try {
    startStep('analyze', CAMPAIGN_RUN_STATUS.ANALYZING);
    await Promise.resolve();
    completeStep('analyze');

    startStep('plan', CAMPAIGN_RUN_STATUS.PLANNING);
    const workflow = createCampaignFromCommand(run.command, {
      platforms: options.platforms,
      mediaTypes: options.mediaTypes,
      publishAt: options.publishAt,
      approvalMode: run.mode === 'automatic' ? 'automatic' : 'review',
      timezone: options.timezone,
      brand: options.brand,
    });
    run = { ...run, workflow };
    completeStep('plan');

    startStep('content', CAMPAIGN_RUN_STATUS.GENERATING_CONTENT);
    run = {
      ...run,
      workflow: {
        ...run.workflow,
        channels: run.workflow.channels.map((channel) => ({
          ...channel,
          contentStatus: 'awaiting_generation',
        })),
      },
    };
    completeStep('content');

    startStep('media', CAMPAIGN_RUN_STATUS.GENERATING_MEDIA);
    const mediaJobCount = run.workflow.channels.reduce(
      (total, channel) => total + channel.jobs.length,
      0,
    );
    run = { ...run, metrics: { mediaJobCount, channelCount: run.workflow.channels.length } };
    completeStep('media');

    startStep('validate', CAMPAIGN_RUN_STATUS.VALIDATING);
    const readiness = evaluateCampaignReadiness(run.workflow);
    run = { ...run, readiness };
    if (readiness.errors.length) {
      throw new Error(readiness.errors.join(' '));
    }
    completeStep('validate');

    startStep('persist', CAMPAIGN_RUN_STATUS.VALIDATING);
    const savedWorkflow = saveCampaignWorkflow({
      ...run.workflow,
      workflowStatus: run.mode === 'automatic' && readiness.ready ? 'approved' : 'draft',
      orchestrator: {
        runId: run.runId,
        mode: run.mode,
        readiness,
      },
    });
    run = { ...run, workflow: savedWorkflow };
    completeStep('persist');

    run = {
      ...run,
      status: run.mode === 'automatic' && readiness.ready
        ? CAMPAIGN_RUN_STATUS.READY
        : CAMPAIGN_RUN_STATUS.WAITING_APPROVAL,
    };
    publishProgress();
    return run;
  } catch (error) {
    const message = error?.message || 'Không thể chạy chiến dịch.';
    const runningStep = run.steps.find((step) => step.status === 'running');
    run = {
      ...run,
      status: CAMPAIGN_RUN_STATUS.FAILED,
      error: message,
      steps: runningStep
        ? updateStep(run.steps, runningStep.id, {
          status: 'failed',
          completedAt: new Date().toISOString(),
          error: message,
        })
        : run.steps,
    };
    publishProgress();
    throw Object.assign(new Error(message), { campaignRun: run });
  }
}
