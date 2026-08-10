const baseUrl = () => String(process.env.REACT_APP_DHP_PUBLISHING_CONTROL_URL || 'http://127.0.0.1:8792').replace(/\/$/, '');
const token = () => String(process.env.REACT_APP_DHP_PUBLISHING_CONTROL_TOKEN || process.env.REACT_APP_DHP_MEDIA_INGRESS_TOKEN || '').trim();

const request = async (path, options = {}) => {
  if (!token()) throw new Error('Publishing Control local chưa có token.');
  const requestId = globalThis.crypto?.randomUUID?.() || `req-${Date.now()}`;
  const response = await fetch(`${baseUrl()}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token()}`,
      'X-DHP-Request-Id': requestId,
      'X-DHP-Source-Service': 'publishing-bot-ui',
      ...(options.headers || {}),
    },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error?.message || payload.error || `Publishing Control lỗi HTTP ${response.status}`);
  return payload.data;
};

export const getPublishingHealth = () => request('/api/v1/publishing/health');
export const pausePublishing = (commandId) => request('/api/v1/publishing/scheduler/pause', {
  method: 'POST',
  headers: { 'Idempotency-Key': commandId || `pause-${Date.now()}` },
});
export const resumePublishing = (commandId) => request('/api/v1/publishing/scheduler/resume', {
  method: 'POST',
  headers: { 'Idempotency-Key': commandId || `resume-${Date.now()}` },
});
