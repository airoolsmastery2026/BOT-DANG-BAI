import { AI_PRODUCTION_STAGES } from './ai_production_workflow';

const STORAGE_KEY = 'dhp_ai_production_runs_v1';

export const STAGE_STATUS = {
  LOCKED: 'locked',
  READY: 'ready',
  RUNNING: 'running',
  REVIEW: 'review',
  PASSED: 'passed',
  REVISION: 'revision',
  BLOCKED: 'blocked',
};

const nowIso = () => new Date().toISOString();
const uid = () => `run_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

export function createProductionRun(input = {}) {
  const createdAt = nowIso();
  return {
    id: uid(),
    name: String(input.name || input.topic || 'Chiến dịch mới').trim(),
    topic: String(input.topic || '').trim(),
    service: String(input.service || '').trim(),
    objective: String(input.objective || '').trim(),
    channels: Array.isArray(input.channels) ? input.channels : ['facebook'],
    createdAt,
    updatedAt: createdAt,
    currentStageId: AI_PRODUCTION_STAGES[0].id,
    approval: { status: 'pending', note: '', approvedAt: null },
    stages: AI_PRODUCTION_STAGES.map((stage, index) => ({
      id: stage.id,
      status: index === 0 ? STAGE_STATUS.READY : STAGE_STATUS.LOCKED,
      startedAt: null,
      completedAt: null,
      revisionCount: 0,
      output: null,
      validation: null,
      note: '',
    })),
  };
}

export function loadProductionRuns(storage) {
  const target = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return [];
  try {
    const parsed = JSON.parse(target.getItem(STORAGE_KEY) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveProductionRuns(runs, storage) {
  const target = storage || (typeof window !== 'undefined' ? window.localStorage : null);
  if (!target) return false;
  try {
    target.setItem(STORAGE_KEY, JSON.stringify(runs));
    return true;
  } catch {
    return false;
  }
}

export function startStage(run, stageId) {
  return updateStage(run, stageId, (stage) => {
    if (![STAGE_STATUS.READY, STAGE_STATUS.REVISION].includes(stage.status)) return stage;
    return { ...stage, status: STAGE_STATUS.RUNNING, startedAt: stage.startedAt || nowIso() };
  });
}

export function submitStageOutput(run, stageId, output, validation) {
  return updateStage(run, stageId, (stage) => ({
    ...stage,
    output,
    validation,
    status: validation?.valid ? STAGE_STATUS.REVIEW : STAGE_STATUS.BLOCKED,
  }));
}

export function approveStage(run, stageId, note = '') {
  const stageIndex = run.stages.findIndex((stage) => stage.id === stageId);
  if (stageIndex < 0) return run;
  const stages = run.stages.map((stage, index) => {
    if (index === stageIndex) return { ...stage, status: STAGE_STATUS.PASSED, completedAt: nowIso(), note };
    if (index === stageIndex + 1 && stage.status === STAGE_STATUS.LOCKED) return { ...stage, status: STAGE_STATUS.READY };
    return stage;
  });
  return { ...run, stages, currentStageId: stages[stageIndex + 1]?.id || stageId, updatedAt: nowIso() };
}

export function requestStageRevision(run, stageId, note = '') {
  return updateStage(run, stageId, (stage) => ({
    ...stage,
    status: STAGE_STATUS.REVISION,
    revisionCount: Number(stage.revisionCount || 0) + 1,
    note,
  }));
}

export function updateRunApproval(run, status, note = '') {
  return {
    ...run,
    approval: {
      status,
      note,
      approvedAt: status === 'approved' ? nowIso() : null,
    },
    updatedAt: nowIso(),
  };
}

function updateStage(run, stageId, updater) {
  const stages = run.stages.map((stage) => stage.id === stageId ? updater(stage) : stage);
  return { ...run, stages, currentStageId: stageId, updatedAt: nowIso() };
}

export function getRunProgress(run) {
  const passed = run.stages.filter((stage) => stage.status === STAGE_STATUS.PASSED).length;
  return Math.round((passed / run.stages.length) * 100);
}
