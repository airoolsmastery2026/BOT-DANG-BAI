const STORAGE_KEY = 'bot_dang_bai_campaign_workflows';
const MAX_WORKFLOWS = 50;

function getStorage(storage) {
  if (storage) return storage;
  if (typeof window !== 'undefined' && window.localStorage) return window.localStorage;
  return null;
}

function normalizeWorkflows(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((workflow) => workflow?.campaign?.id && Array.isArray(workflow?.channels));
}

export function loadCampaignWorkflows(storage) {
  const target = getStorage(storage);
  if (!target) return [];

  try {
    const parsed = JSON.parse(target.getItem(STORAGE_KEY) || '[]');
    return normalizeWorkflows(parsed);
  } catch {
    return [];
  }
}

export function saveCampaignWorkflow(workflow, storage) {
  if (!workflow?.campaign?.id) {
    throw new Error('Workflow không có campaign ID.');
  }

  const target = getStorage(storage);
  if (!target) {
    throw new Error('Trình duyệt không hỗ trợ lưu workflow.');
  }

  const current = loadCampaignWorkflows(target);
  const savedAt = new Date().toISOString();
  const savedWorkflow = {
    ...workflow,
    workflowStatus: workflow.workflowStatus || 'draft',
    savedAt,
  };

  const withoutDuplicate = current.filter(
    (item) => item.campaign.id !== savedWorkflow.campaign.id,
  );
  const next = [savedWorkflow, ...withoutDuplicate].slice(0, MAX_WORKFLOWS);

  try {
    target.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch (error) {
    throw new Error(`Không thể lưu workflow: ${error?.message || 'lỗi bộ nhớ trình duyệt'}`);
  }

  return savedWorkflow;
}

export function removeCampaignWorkflow(campaignId, storage) {
  const normalizedId = String(campaignId || '').trim();
  if (!normalizedId) return false;

  const target = getStorage(storage);
  if (!target) return false;

  const current = loadCampaignWorkflows(target);
  const next = current.filter((item) => item.campaign.id !== normalizedId);
  if (next.length === current.length) return false;

  target.setItem(STORAGE_KEY, JSON.stringify(next));
  return true;
}

export { STORAGE_KEY as CAMPAIGN_WORKFLOW_STORAGE_KEY };
