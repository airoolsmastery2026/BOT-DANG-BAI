import {
  CAMPAIGN_AUDIT_STORAGE_KEY,
  appendCampaignAuditEvent,
  appendWorkflowAuditEvent,
  clearCampaignAuditLog,
  getCampaignAuditLog,
  getCampaignAuditSummary,
} from './campaign_audit_log';

jest.mock('./utils', () => {
  let store = {};
  return {
    saveToLocalStorage: (key, value) => { store[key] = value; return true; },
    getFromLocalStorage: (key, fallback) => store[key] ?? fallback,
    __resetStorage: () => { store = {}; },
    __setStorage: (key, value) => { store[key] = value; },
  };
});

const utils = require('./utils');

beforeEach(() => {
  utils.__resetStorage();
  clearCampaignAuditLog();
});

describe('campaign audit log', () => {
  test('stores normalized campaign lifecycle events newest first', () => {
    appendCampaignAuditEvent({
      id: 'event-1',
      campaignId: 'campaign-1',
      event: 'campaign.planned',
      status: 'completed',
      occurredAt: '2026-08-10T00:00:00.000Z',
      details: { platforms: ['facebook', 'tiktok'] },
    });
    appendCampaignAuditEvent({
      id: 'event-2',
      campaignId: 'campaign-1',
      event: 'campaign.persisted',
      status: 'draft',
      occurredAt: '2026-08-10T00:01:00.000Z',
    });

    const entries = getCampaignAuditLog({ campaignId: 'campaign-1' });
    expect(entries.map((entry) => entry.id)).toEqual(['event-2', 'event-1']);
    expect(entries[1].details.platforms).toEqual(['facebook', 'tiktok']);
  });

  test('does not duplicate the same audit event id', () => {
    const entry = {
      id: 'stable-event',
      campaignId: 'campaign-1',
      event: 'campaign.persisted',
    };
    appendCampaignAuditEvent(entry);
    appendCampaignAuditEvent(entry);
    expect(getCampaignAuditLog()).toHaveLength(1);
  });

  test('creates workflow-scoped audit events with orchestrator run id', () => {
    appendWorkflowAuditEvent({
      campaign: { id: 'campaign-2' },
      orchestrator: { runId: 'run-2' },
    }, 'campaign.approved', {
      id: 'approval-1',
      status: 'approved',
      source: 'review',
    });

    expect(getCampaignAuditLog()[0]).toMatchObject({
      campaignId: 'campaign-2',
      runId: 'run-2',
      event: 'campaign.approved',
      status: 'approved',
      source: 'review',
    });
  });

  test('returns compact event and status summary', () => {
    appendCampaignAuditEvent({ campaignId: 'campaign-1', event: 'campaign.validated', status: 'ready' });
    appendCampaignAuditEvent({ campaignId: 'campaign-1', event: 'campaign.validated', status: 'ready' });
    appendCampaignAuditEvent({ campaignId: 'campaign-1', event: 'campaign.persisted', status: 'draft' });

    expect(getCampaignAuditSummary({ campaignId: 'campaign-1' })).toMatchObject({
      total: 3,
      byEvent: { 'campaign.validated': 2, 'campaign.persisted': 1 },
      byStatus: { ready: 2, draft: 1 },
    });
  });

  test('ignores malformed persisted audit records', () => {
    utils.__setStorage(CAMPAIGN_AUDIT_STORAGE_KEY, [
      null,
      {},
      { campaignId: 'campaign-1', event: 'valid', occurredAt: '2026-08-10T00:00:00.000Z' },
      { campaignId: 'campaign-1', event: 'bad-date', occurredAt: 'invalid' },
    ]);

    expect(getCampaignAuditLog()).toHaveLength(1);
    expect(getCampaignAuditLog()[0].event).toBe('valid');
  });
});
