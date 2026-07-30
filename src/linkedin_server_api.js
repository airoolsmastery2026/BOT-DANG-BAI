const normalizeBaseUrl = (value) => String(value || '').trim().replace(/\/$/, '');

const request = async (baseUrl, apiKey, pathname, options = {}) => {
  const root = normalizeBaseUrl(baseUrl);
  if (!root) throw new Error('Thiếu LinkedIn server URL');

  const response = await fetch(`${root}${pathname}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      ...(options.headers || {}),
    },
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || data.success === false) {
    throw new Error(data.error || `LinkedIn server HTTP ${response.status}`);
  }
  return data;
};

export const getLinkedInHealth = (baseUrl, apiKey) => request(baseUrl, apiKey, '/health');

export const getLinkedInPosts = async (baseUrl, apiKey) => {
  const data = await request(baseUrl, apiKey, '/api/linkedin/posts');
  return data.posts || [];
};

export const createLinkedInPost = async (baseUrl, apiKey, post) => {
  const data = await request(baseUrl, apiKey, '/api/linkedin/posts', {
    method: 'POST',
    body: JSON.stringify(post),
  });
  return data.post;
};

export const processLinkedInPosts = async (baseUrl, apiKey) => {
  const data = await request(baseUrl, apiKey, '/api/linkedin/process', { method: 'POST' });
  return data.processed || [];
};

export const deleteLinkedInPost = (baseUrl, apiKey, id) => request(
  baseUrl,
  apiKey,
  `/api/linkedin/posts/${encodeURIComponent(id)}`,
  { method: 'DELETE' },
);
