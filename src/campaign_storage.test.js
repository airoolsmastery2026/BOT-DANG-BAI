import {
  CAMPAIGN_WORKFLOW_STORAGE_KEY,
  loadCampaignWorkflows,
  removeCampaignWorkflow,
  saveCampaignWorkflow,
} from './campaign_storage';

function createStorage() {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
}

function createWorkflow(id = 'campaign-1') {
  return {
    campaign: { id, topic: 'Tủ bếp veneer' },
    workflowStatus: 'draft',
    channels: [{ platform: 'facebook', jobs: [] }],
  };
}

describe('campaign workflow storage', () => {
  test('saves and loads a workflow', () => {
    const storage = createStorage();
    saveCampaignWorkflow(createWorkflow(), storage);

    const workflows = loadCampaignWorkflows(storage);
    expect(workflows).toHaveLength(1);
    expect(workflows[0].campaign.id).toBe('campaign-1');
    expect(workflows[0].savedAt).toBeTruthy();
  });

  test('replaces a workflow with the same campaign id', () => {
    const storage = createStorage();
    saveCampaignWorkflow(createWorkflow(), storage);
    saveCampaignWorkflow({ ...createWorkflow(), workflowStatus: 'approved' }, storage);

    const workflows = loadCampaignWorkflows(storage);
    expect(workflows).toHaveLength(1);
    expect(workflows[0].workflowStatus).toBe('approved');
  });

  test('returns an empty list for malformed storage data', () => {
    const storage = createStorage();
    storage.setItem(CAMPAIGN_WORKFLOW_STORAGE_KEY, '{bad json');
    expect(loadCampaignWorkflows(storage)).toEqual([]);
  });

  test('removes a saved workflow', () => {
    const storage = createStorage();
    saveCampaignWorkflow(createWorkflow(), storage);

    expect(removeCampaignWorkflow('campaign-1', storage)).toBe(true);
    expect(loadCampaignWorkflows(storage)).toEqual([]);
  });

  test('rejects a workflow without campaign id', () => {
    const storage = createStorage();
    expect(() => saveCampaignWorkflow({ channels: [] }, storage)).toThrow('campaign ID');
  });
});
