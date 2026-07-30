const normalizeBaseUrl = (value) => String(value || '').trim().replace(/\/$/, '');

class ZaloServerAPI {
  constructor(baseUrl, apiKey = '') {
    this.baseUrl = normalizeBaseUrl(baseUrl);
    this.apiKey = String(apiKey || '').trim();
  }

  validate() {
    if (!this.baseUrl) throw new Error('Thiếu URL Zalo Server');
  }

  async request(path, options = {}) {
    this.validate();

    const response = await fetch(`${this.baseUrl}${path}`, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(this.apiKey ? { 'X-API-Key': this.apiKey } : {}),
        ...(options.headers || {}),
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok || data.success === false) {
      throw new Error(data.error || `Zalo Server HTTP ${response.status}`);
    }
    return data;
  }

  health() {
    return this.request('/health');
  }

  listMessages() {
    return this.request('/api/zalo/messages');
  }

  createMessage({ userId, content, scheduledTime }) {
    return this.request('/api/zalo/messages', {
      method: 'POST',
      body: JSON.stringify({ userId, content, scheduledTime }),
    });
  }

  processQueue() {
    return this.request('/api/zalo/process', { method: 'POST', body: '{}' });
  }

  deleteMessage(id) {
    return this.request(`/api/zalo/messages/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }
}

export { ZaloServerAPI };
