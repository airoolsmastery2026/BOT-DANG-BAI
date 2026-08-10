import { getFromLocalStorage, saveToLocalStorage } from './utils';

export const CAMPAIGN_AUDIT_STORAGE_KEY = 'bot_dang_bai_campaign_audit';
const MAX_AUDIT_ENTRIES = 1000;

const clean = (value, max = 500) => String(value || '').trim().slice(0, max);

const normalizeDetails = (details) => {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return {};
  return Object.fromEntries(
    Object.entries(details)
      .slice(0, 20)
      .map(([key, value]) => {
        if (typeof value === 'string') return [clean(key, 80), clean(value, 1000)];
        if (typeof value === 'number' || typeof value === 'boolean' || value === null) return [clean(key, 80), value];
        if (Array.isArray(value)) return [clean(key, 80), value.slice(0, 30).map((item) => clean(item, 200))];
        return [clean(key, 80), clean(JSON.stringify(value), 1000)];
      }),
  );
};

const normalizeEntry = (entry) => {
  if (!entry || typeof entry !== 'object') return null;
  const event = clean(entry.event, 120);
  const campaignId = clean(entry.campaignId, 160);
  if (!event || !campaignId) return null;
  const occurredAt = new Date(entry.occurredAt || Date.now());
  if (Number.isNaN(occurredAt.getTime())) return null;

  return {
    id: clean(entry.id, 180) || `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    campaignId,
    runId: clean(entry.runId, 160) || null,
    event,
    status: clean(entry.status, 80) || null,
    source: clean(entry.source, 80) || 'ui',
    occurredAt: occurredAt.toISOString(),
    details: normalizeDetails(entry.details),
  };
};

export function getCampaignAuditLog({ campaignId = null, limit = 200 } = {}) {
  const entries = getFromLocalStorage(CAMPAIGN_AUDIT_STORAGE_KEY, []);
  const normalizedCampaignId = campaignId ? clean(campaignId, 160) : null;
  const safeLimit = Math.min(Math.max(Number(limit) || 1, 1), MAX_AUDIT_ENTRIES);
  if (!Array.isArray(entries)) return [];

  return entries
    .map(normalizeEntry)
    .filter(Boolean)
    .filter((entry) => !normalizedCampaignId || entry.campaignId === normalizedCampaignId)
    .sort((left, right) => new Date(right.occurredAt) - new Date(left.occurredAt))
    .slice(0, safeLimit);
}

export function appendCampaignAuditEvent(entry) {
  const normalized = normalizeEntry(entry);
  if (!normalized) throw new Error('Sự kiện audit chiến dịch không hợp lệ.');

  const current = getCampaignAuditLog({ limit: MAX_AUDIT_ENTRIES });
  if (current.some((item) => item.id === normalized.id)) return normalized;
  const next = [normalized, ...current].slice(0, MAX_AUDIT_ENTRIES);
  saveToLocalStorage(CAMPAIGN_AUDIT_STORAGE_KEY, next);
  return normalized;
}

export function appendWorkflowAuditEvent(workflow, event, options = {}) {
  const campaignId = clean(workflow?.campaign?.id, 160);
  if (!campaignId) throw new Error('Workflow thiếu campaign ID để ghi audit.');
  const runId = clean(workflow?.orchestrator?.runId || options.runId, 160) || null;
  const stableId = clean(options.id, 180)
    || `${campaignId}:${runId || 'manual'}:${clean(event, 120)}:${clean(options.status, 80) || 'event'}:${clean(options.sequence, 40) || Date.now()}`;

  return appendCampaignAuditEvent({
    id: stableId,
    campaignId,
    runId,
    event,
    status: options.status,
    source: options.source || 'campaign',
    occurredAt: options.occurredAt || new Date().toISOString(),
    details: options.details || {},
  });
}

export function clearCampaignAuditLog() {
  saveToLocalStorage(CAMPAIGN_AUDIT_STORAGE_KEY, []);
  return [];
}

export function getCampaignAuditSummary({ campaignId = null } = {}) {
  const entries = getCampaignAuditLog({ campaignId, limit: MAX_AUDIT_ENTRIES });
  return entries.reduce((summary, entry) => {
    summary.total += 1;
    summary.byEvent[entry.event] = (summary.byEvent[entry.event] || 0) + 1;
    if (entry.status) summary.byStatus[entry.status] = (summary.byStatus[entry.status] || 0) + 1;
    return summary;
  }, { total: 0, byEvent: {}, byStatus: {} });
}
