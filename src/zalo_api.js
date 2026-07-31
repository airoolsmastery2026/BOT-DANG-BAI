const DEFAULT_ZALO_OA_ENDPOINT = 'https://openapi.zalo.me/v3.0/oa/message/cs';

/**
 * Client tối giản cho Zalo Official Account OpenAPI.
 *
 * Phạm vi hiện tại: gửi tin nhắn văn bản tới user_id đã tương tác/cho phép OA.
 * Đây không phải API đăng bài lên nhật ký cá nhân hoặc quét người dùng Zalo.
 */
class ZaloOAAPI {
  constructor(accessToken, options = {}) {
    this.accessToken = (accessToken || '').trim();
    this.endpoint = options.endpoint || DEFAULT_ZALO_OA_ENDPOINT;
  }

  validate() {
    if (!this.accessToken) {
      throw new Error('Thiếu Zalo OA Access Token');
    }
  }

  async sendTextMessage(userId, text) {
    try {
      this.validate();

      if (!String(userId || '').trim()) {
        throw new Error('Thiếu Zalo user_id người nhận');
      }

      if (!String(text || '').trim()) {
        throw new Error('Nội dung Zalo không được để trống');
      }

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          access_token: this.accessToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          recipient: { user_id: String(userId).trim() },
          message: { text: String(text).trim() },
        }),
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok || Number(data.error) !== 0) {
        throw new Error(data.message || data.error_name || `Zalo OA API lỗi HTTP ${response.status}`);
      }

      return {
        success: true,
        messageId: data.data?.message_id || data.message_id || null,
        raw: data,
      };
    } catch (error) {
      console.error('Zalo OA Send Error:', error);
      return { success: false, error: error.message };
    }
  }
}

export { ZaloOAAPI, DEFAULT_ZALO_OA_ENDPOINT };
