export const DEFAULT_META_GRAPH_API_VERSION = 'v25.0';

const normalizeVersion = (value) => {
  const normalized = String(value || '').trim();
  return /^v\d+\.\d+$/.test(normalized) ? normalized : DEFAULT_META_GRAPH_API_VERSION;
};

export const getMetaGraphApiVersion = () => normalizeVersion(
  process.env.REACT_APP_META_GRAPH_API_VERSION || DEFAULT_META_GRAPH_API_VERSION,
);

const graphBaseUrl = () => `https://graph.facebook.com/${getMetaGraphApiVersion()}`;

const asMessage = (value, fallback) => String(value || '').trim() || fallback;

const readJson = async (response, fallbackMessage) => {
  const payload = await response.json().catch(() => ({}));
  const apiError = payload?.error;
  if (!response.ok || apiError) {
    const error = new Error(asMessage(apiError?.message, fallbackMessage));
    error.code = apiError?.code || `HTTP_${response.status}`;
    error.subcode = apiError?.error_subcode || null;
    error.retryable = response.status === 429 || response.status >= 500;
    throw error;
  }
  return payload;
};

const bearerHeaders = (accessToken, extra = {}) => ({
  Authorization: `Bearer ${String(accessToken || '').trim()}`,
  Accept: 'application/json',
  ...extra,
});

const formBody = (values) => {
  const body = new URLSearchParams();
  Object.entries(values || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    body.set(key, String(value));
  });
  return body;
};

const requireToken = (accessToken) => {
  if (!String(accessToken || '').trim()) throw new Error('Thiếu Meta access token.');
};

const requireId = (value, message) => {
  const id = String(value || '').trim();
  if (!id) throw new Error(message);
  return id;
};

export class FacebookPagePublishingAPI {
  constructor(accessToken) {
    requireToken(accessToken);
    this.accessToken = String(accessToken).trim();
  }

  async getPageIdentity(pageId) {
    const id = requireId(pageId, 'Thiếu Facebook Page ID.');
    const params = new URLSearchParams({ fields: 'id,name,picture' });
    const response = await fetch(`${graphBaseUrl()}/${encodeURIComponent(id)}?${params}`, {
      headers: bearerHeaders(this.accessToken),
      cache: 'no-store',
    });
    const data = await readJson(response, 'Không thể đọc Facebook Page.');
    return {
      id: String(data.id || '').trim(),
      name: String(data.name || '').trim(),
      picture: data.picture?.data?.url || null,
      platform: 'Facebook',
    };
  }

  async publishPost(pageId, message, { imageUrl, linkUrl } = {}) {
    const id = requireId(pageId, 'Thiếu Facebook Page ID.');
    const content = String(message || '').trim();
    if (!content) throw new Error('Nội dung Facebook không được để trống.');

    const isPhoto = Boolean(String(imageUrl || '').trim());
    const endpoint = isPhoto ? 'photos' : 'feed';
    const body = isPhoto
      ? formBody({ url: String(imageUrl).trim(), caption: content })
      : formBody({ message: content, link: String(linkUrl || '').trim() });

    const response = await fetch(`${graphBaseUrl()}/${encodeURIComponent(id)}/${endpoint}`, {
      method: 'POST',
      headers: bearerHeaders(this.accessToken, {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      }),
      body,
    });
    const data = await readJson(response, 'Facebook publish error.');
    const externalPostId = data.id || data.post_id || null;
    return { success: true, postId: externalPostId, externalPostId, raw: data };
  }
}

export class InstagramPublishingAPI {
  constructor(accessToken) {
    requireToken(accessToken);
    this.accessToken = String(accessToken).trim();
  }

  async getAccountIdentity(instagramUserId) {
    const id = requireId(instagramUserId, 'Thiếu Instagram Business/Creator ID.');
    const params = new URLSearchParams({ fields: 'id,username,name,profile_picture_url' });
    const response = await fetch(`${graphBaseUrl()}/${encodeURIComponent(id)}?${params}`, {
      headers: bearerHeaders(this.accessToken),
      cache: 'no-store',
    });
    const data = await readJson(response, 'Không thể đọc tài khoản Instagram.');
    return {
      id: String(data.id || '').trim(),
      sourceId: String(data.id || '').trim(),
      name: String(data.username || data.name || '').trim(),
      username: String(data.username || '').trim(),
      picture: data.profile_picture_url || null,
      platform: 'Instagram',
    };
  }

  async publishImage(instagramUserId, imageUrl, caption = '') {
    const id = requireId(instagramUserId, 'Thiếu Instagram Business/Creator ID.');
    const mediaUrl = String(imageUrl || '').trim();
    if (!/^https?:\/\//i.test(mediaUrl)) throw new Error('Instagram yêu cầu URL ảnh HTTP/HTTPS công khai.');

    const createResponse = await fetch(`${graphBaseUrl()}/${encodeURIComponent(id)}/media`, {
      method: 'POST',
      headers: bearerHeaders(this.accessToken, {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      }),
      body: formBody({ image_url: mediaUrl, caption: String(caption || '') }),
    });
    const container = await readJson(createResponse, 'Instagram media container error.');
    const creationId = requireId(container.id, 'Instagram không trả về creation ID.');

    const publishResponse = await fetch(`${graphBaseUrl()}/${encodeURIComponent(id)}/media_publish`, {
      method: 'POST',
      headers: bearerHeaders(this.accessToken, {
        'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
      }),
      body: formBody({ creation_id: creationId }),
    });
    const data = await readJson(publishResponse, 'Instagram publish error.');
    const externalPostId = data.id || null;
    return { success: true, postId: externalPostId, externalPostId, raw: data };
  }
}
