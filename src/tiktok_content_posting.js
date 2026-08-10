const BASE_URL = 'https://open.tiktokapis.com/v2';

const asMessage = (value, fallback) => String(value || '').trim() || fallback;

const readTikTokResponse = async (response, fallbackMessage) => {
  const body = await response.json().catch(() => ({}));
  const error = body?.error;

  if (!response.ok || (error && error.code && error.code !== 'ok')) {
    const err = new Error(asMessage(error?.message, fallbackMessage));
    err.code = error?.code || `HTTP_${response.status}`;
    err.retryable = response.status === 429 || response.status >= 500;
    throw err;
  }

  return body;
};

const isHttpUrl = (value) => {
  try {
    const url = new URL(String(value || '').trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

export class TikTokContentPostingAPI {
  constructor(accessToken) {
    this.accessToken = String(accessToken || '').trim();
    this.baseUrl = BASE_URL;
  }

  async getCreatorInfo() {
    if (!this.accessToken) throw new Error('Thiếu TikTok access token.');

    const response = await fetch(`${this.baseUrl}/post/publish/creator_info/query/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
    });
    const body = await readTikTokResponse(response, 'Không thể đọc quyền đăng TikTok.');
    const data = body?.data || {};

    if (!data.creator_username && !data.creator_nickname) {
      throw new Error('TikTok không trả về thông tin creator hợp lệ.');
    }

    return {
      id: String(data.creator_username || '').trim(),
      name: String(data.creator_nickname || data.creator_username || '').trim(),
      platform: 'TikTok',
      avatar: String(data.creator_avatar_url || '').trim(),
      privacyLevelOptions: Array.isArray(data.privacy_level_options)
        ? data.privacy_level_options.map((value) => String(value)).filter(Boolean)
        : [],
      commentDisabled: Boolean(data.comment_disabled),
      duetDisabled: Boolean(data.duet_disabled),
      stitchDisabled: Boolean(data.stitch_disabled),
      maxVideoPostDurationSec: Number.isFinite(Number(data.max_video_post_duration_sec))
        ? Number(data.max_video_post_duration_sec)
        : null,
    };
  }

  async publishVideo(videoUrl, caption = '', { privacyLevel = 'SELF_ONLY', creatorInfo = null } = {}) {
    if (!isHttpUrl(videoUrl)) throw new Error('TikTok yêu cầu URL video HTTP/HTTPS hợp lệ.');

    const creator = creatorInfo || await this.getCreatorInfo();
    const allowedPrivacy = Array.isArray(creator?.privacyLevelOptions)
      ? creator.privacyLevelOptions
      : [];
    if (!allowedPrivacy.includes(privacyLevel)) {
      throw new Error(`TikTok không cho phép privacy level ${privacyLevel} với tài khoản này.`);
    }

    const response = await fetch(`${this.baseUrl}/post/publish/video/init/`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json; charset=UTF-8',
      },
      body: JSON.stringify({
        post_info: {
          title: String(caption || ''),
          privacy_level: privacyLevel,
        },
        source_info: {
          source: 'PULL_FROM_URL',
          video_url: String(videoUrl).trim(),
        },
      }),
    });
    const body = await readTikTokResponse(response, 'TikTok publish error.');

    return {
      success: true,
      publishId: body?.data?.publish_id || null,
      externalPostId: body?.data?.publish_id || null,
      creator,
      privacyLevel,
      raw: body,
    };
  }
}
