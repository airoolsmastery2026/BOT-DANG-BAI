'use strict';

const isHttpUrl = (value) => /^https?:\/\//i.test(String(value || '').trim());

function createYouTubeAdapter({ fetchImpl = fetch, timeoutMs = 30_000 } = {}) {
  const headers = (accessToken, extra = {}) => ({
    Authorization: `Bearer ${accessToken}`,
    Accept: 'application/json',
    ...extra,
  });

  const readJson = async (response, fallback) => {
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(body?.error?.message || body?.message || fallback || `HTTP ${response.status}`);
      error.code = body?.error?.code || `HTTP_${response.status}`;
      error.retryable = response.status === 429 || response.status >= 500;
      throw error;
    }
    return body;
  };

  const verify = async (credentials) => {
    const response = await fetchImpl('https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true', {
      headers: headers(credentials.accessToken),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const data = await readJson(response, 'YouTube channel verify failed.');
    const channel = Array.isArray(data?.items) ? data.items[0] : null;
    if (!channel?.id) throw new Error('YouTube token không trả về channel đã xác thực.');
    if (String(channel.id) !== String(credentials.channelId)) throw new Error('YouTube token không khớp Channel ID trong vault.');
    return { platform: 'youtube', ok: true, account: { id: channel.id, name: channel?.snippet?.title || channel.id } };
  };

  const publish = async (job, credentials) => {
    const videoUrl = String(job.videoUrl || '').trim();
    if (!isHttpUrl(videoUrl)) throw new Error('YouTube cần video URL HTTP/HTTPS công khai.');

    const source = await fetchImpl(videoUrl, {
      redirect: 'follow',
      signal: AbortSignal.timeout(Math.max(timeoutMs, 120_000)),
    });
    if (!source.ok) {
      const error = new Error(`Không tải được video nguồn cho YouTube (HTTP ${source.status}).`);
      error.code = `SOURCE_HTTP_${source.status}`;
      error.retryable = source.status === 429 || source.status >= 500;
      throw error;
    }
    const contentType = String(source.headers.get('content-type') || 'video/mp4').split(';')[0].trim();
    if (!contentType.startsWith('video/') && contentType !== 'application/octet-stream') {
      throw new Error(`YouTube source có Content-Type không hợp lệ: ${contentType || 'unknown'}.`);
    }
    const bytes = Buffer.from(await source.arrayBuffer());
    if (!bytes.length) throw new Error('YouTube source video rỗng.');

    const privacyStatus = ['private', 'unlisted', 'public'].includes(String(job.privacyStatus || '').trim())
      ? String(job.privacyStatus).trim()
      : 'private';
    const title = String(job.title || job.content || 'Video').trim().slice(0, 100);
    const description = String(job.content || '').trim().slice(0, 5000);

    const init = await fetchImpl('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
      method: 'POST',
      headers: headers(credentials.accessToken, {
        'Content-Type': 'application/json; charset=UTF-8',
        'X-Upload-Content-Length': String(bytes.length),
        'X-Upload-Content-Type': contentType,
      }),
      body: JSON.stringify({
        snippet: { title, description },
        status: { privacyStatus, selfDeclaredMadeForKids: false },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!init.ok) await readJson(init, 'YouTube resumable session failed.');
    const uploadUrl = String(init.headers.get('location') || '').trim();
    if (!/^https:\/\//i.test(uploadUrl)) throw new Error('YouTube không trả về resumable upload URL.');

    const uploaded = await fetchImpl(uploadUrl, {
      method: 'PUT',
      headers: headers(credentials.accessToken, {
        'Content-Type': contentType,
        'Content-Length': String(bytes.length),
      }),
      body: bytes,
      signal: AbortSignal.timeout(Math.max(timeoutMs, 300_000)),
    });
    const data = await readJson(uploaded, 'YouTube video upload failed.');
    if (!data?.id) throw new Error('YouTube upload không trả về Video ID.');

    return {
      success: true,
      externalPostId: String(data.id),
      url: `https://www.youtube.com/watch?v=${encodeURIComponent(data.id)}`,
      privacyStatus,
      publishedAt: new Date().toISOString(),
    };
  };

  return { publish, verify };
}

module.exports = { createYouTubeAdapter, isHttpUrl };
