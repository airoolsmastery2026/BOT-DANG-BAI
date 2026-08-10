const baseUrl = () => String(process.env.REACT_APP_DHP_PUBLISHING_CONTROL_URL || '').trim().replace(/\/$/, '');
const token = () => String(process.env.REACT_APP_DHP_PUBLISHING_CONTROL_TOKEN || '').trim();

export const isPublishingControlConfigured = () => Boolean(baseUrl() && token());

const request = async (path, options = {}) => {
  if (!isPublishingControlConfigured()) {
    throw new Error('Publishing Control local chưa được cấu hình.');
  }

  const requestId = window.crypto?.randomUUID?.() || `req-${Date.now()}`;
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

export const getPublishingHealth = async () => {
  if (!isPublishingControlConfigured()) {
    return { configured: false, scheduler: null };
  }
  const data = await request('/api/v1/publishing/health');
  return { configured: true, ...(data || {}) };
};
