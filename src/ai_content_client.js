const configuredBaseUrl = () => String(
  process.env.REACT_APP_DHP_AI_CONTENT_URL || '',
).trim().replace(/\/$/, '');

export const isAIContentServerConfigured = () => Boolean(configuredBaseUrl());

const parseResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `AI Content Server HTTP ${response.status}`);
  }
  return payload;
};

export async function getAIContentHealth() {
  const baseUrl = configuredBaseUrl();
  if (!baseUrl) {
    return {
      gatewayConfigured: false,
      serverConfigured: false,
      status: 'disabled',
      provider: null,
      model: null,
    };
  }

  const response = await fetch(`${baseUrl}/health`, {
    method: 'GET',
    cache: 'no-store',
  });
  const payload = await parseResponse(response);
  return {
    gatewayConfigured: true,
    serverConfigured: payload.configured === true,
    status: payload.status || 'unknown',
    provider: payload.provider || null,
    model: payload.model || null,
  };
}

export async function requestAIContent(input) {
  const baseUrl = configuredBaseUrl();
  if (!baseUrl) throw new Error('AI Content Server chưa được cấu hình.');

  const response = await fetch(`${baseUrl}/api/v1/content/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const payload = await parseResponse(response);
  const text = String(payload?.data?.text || '').trim();
  if (!text) throw new Error('AI Content Server không trả về nội dung.');
  return {
    text,
    model: payload?.data?.model || null,
  };
}
