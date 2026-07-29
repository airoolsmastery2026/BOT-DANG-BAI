/**
 * API Handler cho các nền tảng mạng xã hội
 * Xử lý kết nối, xác thực và lấy dữ liệu khách hàng
 */

// ============= FACEBOOK GRAPH API =============
class FacebookAPI {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.apiVersion = 'v18.0';
    this.baseUrl = `https://graph.facebook.com/${this.apiVersion}`;
  }

  /**
   * Tìm kiếm các trang Facebook theo từ khóa
   */
  async searchPages(keywords, filters = {}) {
    try {
      const params = new URLSearchParams({
        q: keywords.join(' '),
        type: 'page',
        fields: 'id,name,category,picture,fans,engagement',
        access_token: this.accessToken,
        limit: filters.limit || 50,
      });

      const response = await fetch(`${this.baseUrl}/search?${params}`);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || 'Facebook API error');
      }

      return (data.data || []).map(page => ({
        id: `fb_${page.id}`,
        name: page.name,
        platform: 'Facebook',
        followers: page.fans || 0,
        category: page.category,
        picture: page.picture?.data?.url,
        url: `https://facebook.com/${page.id}`,
        foundDate: new Date().toISOString(),
      }));
    } catch (error) {
      console.error('Facebook Search Error:', error);
      return [];
    }
  }

  /**
   * Lấy thông tin chi tiết của một trang
   */
  async getPageDetails(pageId) {
    try {
      const params = new URLSearchParams({
        fields: 'id,name,category,about,fans,talking_about_count,website,picture',
        access_token: this.accessToken,
      });

      const response = await fetch(`${this.baseUrl}/${pageId}?${params}`);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || 'Facebook API error');
      }

      return {
        id: data.id,
        name: data.name,
        category: data.category,
        about: data.about,
        followers: data.fans,
        engagement: data.talking_about_count,
        website: data.website,
        picture: data.picture?.data?.url,
      };
    } catch (error) {
      console.error('Get Page Details Error:', error);
      return null;
    }
  }

  /**
   * Đăng bài lên Facebook Page.
   * Yêu cầu quyền `pages_manage_posts`.
   * @param {string} pageId
   * @param {string} message
   * @param {{imageUrl?: string, linkUrl?: string}} [options]
   */
  async publishPost(pageId, message, { imageUrl, linkUrl } = {}) {
    try {
      const endpoint = imageUrl ? `${this.baseUrl}/${pageId}/photos` : `${this.baseUrl}/${pageId}/feed`;
      const body = new URLSearchParams({
        access_token: this.accessToken,
        ...(imageUrl ? { url: imageUrl, caption: message } : { message }),
        ...(linkUrl && !imageUrl ? { link: linkUrl } : {}),
      });

      const response = await fetch(endpoint, { method: 'POST', body });
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || 'Facebook publish error');
      }

      return { success: true, postId: data.id || data.post_id, raw: data };
    } catch (error) {
      console.error('Facebook Publish Error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Lấy danh sách bài đăng gần đây
   */
  async getPagePosts(pageId, limit = 10) {
    try {
      const params = new URLSearchParams({
        fields: 'id,message,created_time,type,link,picture,full_picture,likes.summary(true).limit(0),comments.summary(true).limit(0),shares',
        access_token: this.accessToken,
        limit: String(limit),
      });

      const response = await fetch(`${this.baseUrl}/${pageId}/posts?${params}`);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || 'Facebook API error');
      }

      return (data.data || []).map(post => ({
        id: post.id,
        message: post.message,
        createdTime: post.created_time,
        type: post.type,
        link: post.link,
        likes: post.likes?.summary?.total_count || 0,
        comments: post.comments?.summary?.total_count || 0,
        shares: post.shares?.count || 0,
      }));
    } catch (error) {
      console.error('Get Posts Error:', error);
      return [];
    }
  }
}

// ============= INSTAGRAM GRAPH API =============
class InstagramAPI {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.apiVersion = 'v18.0';
    this.baseUrl = `https://graph.instagram.com/${this.apiVersion}`;
  }

  /**
   * Lấy thông tin tài khoản Instagram đã kết nối
   * Lưu ý: Instagram Graph API không hỗ trợ tìm kiếm công khai theo từ khóa;
   * API chỉ trả về dữ liệu của tài khoản Business/Creator đã cấp quyền qua token.
   */
  async searchAccounts(keywords, filters = {}) {
    try {
      const params = new URLSearchParams({
        fields: 'id,username,name,biography,profile_picture_url,followers_count,media_count',
        access_token: this.accessToken,
      });

      const response = await fetch(`${this.baseUrl}/me?${params}`);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || 'Instagram API error');
      }

      return [{
        id: `ig_${data.id}`,
        name: data.username,
        platform: 'Instagram',
        followers: data.followers_count || 0,
        bio: data.biography,
        picture: data.profile_picture_url,
        url: `https://instagram.com/${data.username}`,
        foundDate: new Date().toISOString(),
      }];
    } catch (error) {
      console.error('Instagram Search Error:', error);
      return [];
    }
  }

  /**
   * Đăng bài lên Instagram (yêu cầu ảnh/video, Instagram không hỗ trợ đăng
   * bài chỉ có text). Quy trình 2 bước theo Content Publishing API:
   * 1) Tạo media container, 2) Publish container đó.
   * Yêu cầu quyền `instagram_content_publish`.
   * @param {string} igUserId - Instagram Business Account ID
   * @param {string} imageUrl - URL ảnh công khai (bắt buộc)
   * @param {string} caption
   */
  async publishPost(igUserId, imageUrl, caption = '') {
    try {
      if (!imageUrl) {
        throw new Error('Instagram yêu cầu ảnh hoặc video, không hỗ trợ đăng chỉ có văn bản');
      }

      // Bước 1: tạo container
      const createParams = new URLSearchParams({
        image_url: imageUrl,
        caption,
        access_token: this.accessToken,
      });
      const createRes = await fetch(`${this.baseUrl}/${igUserId}/media?${createParams}`, { method: 'POST' });
      const createData = await createRes.json();
      if (createData.error) throw new Error(createData.error.message || 'Instagram container error');

      // Bước 2: publish container
      const publishParams = new URLSearchParams({
        creation_id: createData.id,
        access_token: this.accessToken,
      });
      const publishRes = await fetch(`${this.baseUrl}/${igUserId}/media_publish?${publishParams}`, { method: 'POST' });
      const publishData = await publishRes.json();
      if (publishData.error) throw new Error(publishData.error.message || 'Instagram publish error');

      return { success: true, postId: publishData.id, raw: publishData };
    } catch (error) {
      console.error('Instagram Publish Error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Lấy các bài viết gần đây
   */
  async getRecentPosts(userId, limit = 10) {
    try {
      const params = new URLSearchParams({
        fields: 'id,caption,media_type,media_url,timestamp,like_count,comments_count',
        access_token: this.accessToken,
        limit: String(limit),
      });

      const response = await fetch(`${this.baseUrl}/${userId}/media?${params}`);
      const data = await response.json();

      if (data.error) {
        throw new Error(data.error.message || 'Instagram API error');
      }

      return (data.data || []).map(post => ({
        id: post.id,
        caption: post.caption,
        mediaType: post.media_type,
        url: post.media_url,
        timestamp: post.timestamp,
        likes: post.like_count || 0,
        comments: post.comments_count || 0,
      }));
    } catch (error) {
      console.error('Get Posts Error:', error);
      return [];
    }
  }
}

// ============= TIKTOK API =============
// Lưu ý: TikTok Open API chính thức không cung cấp endpoint tìm kiếm
// người dùng công khai cho ứng dụng bên thứ ba. Các phương thức dưới đây
// hoạt động với dữ liệu của chính tài khoản đã cấp quyền OAuth qua token.
class TikTokAPI {
  constructor(accessToken) {
    this.accessToken = accessToken;
    this.baseUrl = 'https://open.tiktokapis.com/v2';
  }

  /**
   * Lấy thông tin tài khoản đã kết nối
   */
  async getUserInfo() {
    try {
      const params = new URLSearchParams({
        fields: 'open_id,union_id,avatar_url,display_name,follower_count,following_count,likes_count,video_count',
      });

      const response = await fetch(`${this.baseUrl}/user/info/?${params}`, {
        headers: { Authorization: `Bearer ${this.accessToken}` },
      });
      const data = await response.json();

      if (data.error && data.error.code !== 'ok') {
        throw new Error(data.error.message || 'TikTok API error');
      }

      const user = data.data?.user;
      if (!user) return null;

      return {
        id: `tt_${user.open_id}`,
        name: user.display_name,
        platform: 'TikTok',
        avatar: user.avatar_url,
        followers: user.follower_count || 0,
        following: user.following_count || 0,
        videos: user.video_count || 0,
        hearts: user.likes_count || 0,
        foundDate: new Date().toISOString(),
      };
    } catch (error) {
      console.error('Get User Info Error:', error);
      return null;
    }
  }

  /**
   * Đăng video lên TikTok qua Content Posting API (init bằng URL video công khai).
   * Yêu cầu quyền `video.publish`. Video sẽ được đưa vào draft/inbox của người
   * dùng để họ xác nhận đăng (theo chính sách TikTok cho hầu hết loại app).
   * @param {string} videoUrl - URL video công khai, có thể truy cập được
   * @param {string} caption
   */
  async publishVideo(videoUrl, caption = '') {
    try {
      const response = await fetch(`${this.baseUrl}/post/publish/video/init/`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          post_info: {
            title: caption,
            privacy_level: 'SELF_ONLY',
          },
          source_info: {
            source: 'PULL_FROM_URL',
            video_url: videoUrl,
          },
        }),
      });
      const data = await response.json();

      if (data.error && data.error.code !== 'ok') {
        throw new Error(data.error.message || 'TikTok publish error');
      }

      return { success: true, publishId: data.data?.publish_id, raw: data };
    } catch (error) {
      console.error('TikTok Publish Error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Lấy danh sách video gần đây của tài khoản đã kết nối
   */
  async getUserVideos(limit = 20) {
    try {
      const response = await fetch(`${this.baseUrl}/video/list/?max_count=${limit}`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          fields: ['id', 'create_time', 'video_description', 'share_count', 'view_count', 'like_count', 'comment_count'],
        }),
      });
      const data = await response.json();

      if (data.error && data.error.code !== 'ok') {
        throw new Error(data.error.message || 'TikTok API error');
      }

      return (data.data?.videos || []).map(video => ({
        id: video.id,
        title: video.video_description,
        createdTime: video.create_time,
        views: video.view_count || 0,
        likes: video.like_count || 0,
        comments: video.comment_count || 0,
        shares: video.share_count || 0,
      }));
    } catch (error) {
      console.error('Get Videos Error:', error);
      return [];
    }
  }
}

// ============= ADVANCED SEARCH ENGINE =============
class CustomerSearchEngine {
  constructor(credentials) {
    this.facebook = credentials.facebook_token ? new FacebookAPI(credentials.facebook_token) : null;
    this.instagram = credentials.instagram_token ? new InstagramAPI(credentials.instagram_token) : null;
    this.tiktok = credentials.tiktok_token ? new TikTokAPI(credentials.tiktok_token) : null;
  }

  /**
   * Tìm kiếm toàn bộ các nền tảng đã kết nối
   */
  async searchAllPlatforms(keywords, config = {}) {
    const results = {
      facebook: [],
      instagram: [],
      tiktok: [],
      merged: [],
      errors: [],
    };

    // Facebook
    if (this.facebook && config.searchFacebook !== false) {
      try {
        results.facebook = await this.facebook.searchPages(keywords, { limit: config.limit || 50 });
      } catch (error) {
        results.errors.push({ platform: 'Facebook', message: error.message });
      }
    }

    // Instagram
    if (this.instagram && config.searchInstagram !== false) {
      try {
        results.instagram = await this.instagram.searchAccounts(keywords, { limit: config.limit || 50 });
      } catch (error) {
        results.errors.push({ platform: 'Instagram', message: error.message });
      }
    }

    // TikTok
    if (this.tiktok && config.searchTikTok !== false) {
      try {
        const user = await this.tiktok.getUserInfo();
        results.tiktok = user ? [user] : [];
      } catch (error) {
        results.errors.push({ platform: 'TikTok', message: error.message });
      }
    }

    results.merged = [...results.facebook, ...results.instagram, ...results.tiktok].filter(customer => {
      if (config.minFollowers && customer.followers < config.minFollowers) return false;
      if (config.locations && config.locations.length > 0 && customer.location) {
        if (!config.locations.includes(customer.location)) return false;
      }
      return true;
    });

    return results;
  }

  /**
   * Tính toán engagement rate
   */
  calculateEngagementRate(followers, interactions) {
    if (!followers) return '0.00';
    return ((interactions / followers) * 100).toFixed(2);
  }

  /**
   * Tính điểm khả năng của khách hàng
   */
  calculateMatchScore(customer, config) {
    let score = 50;

    if (config.minFollowers && customer.followers >= config.minFollowers * 2) {
      score += 25;
    } else if (config.minFollowers && customer.followers >= config.minFollowers) {
      score += 15;
    }

    const engagement = parseFloat(
      this.calculateEngagementRate(customer.followers, customer.interactions || 0)
    );

    if (config.minEngagement && engagement >= config.minEngagement * 1.5) {
      score += 25;
    } else if (config.minEngagement && engagement >= config.minEngagement) {
      score += 15;
    }

    return Math.min(score, 100);
  }
}

// ============= EXPORTS =============
export { FacebookAPI, InstagramAPI, TikTokAPI, CustomerSearchEngine };

/**
 * HƯỚNG DẪN SỬ DỤNG - xem SETUP_GUIDE.md để lấy access token cho từng nền tảng.
 *
 * ⚠️ Lưu ý quan trọng về giới hạn của các API chính thức:
 * - Facebook Graph API: tìm kiếm Page công khai theo từ khóa yêu cầu quyền
 *   đặc biệt (Page Public Content Access) do Facebook cấp riêng cho từng app,
 *   không tự động có sẵn với mọi access token.
 * - Instagram Graph API KHÔNG hỗ trợ tìm kiếm tài khoản công khai của người
 *   khác — chỉ đọc được dữ liệu của tài khoản Business/Creator mà token
 *   thuộc về.
 * - TikTok Open API KHÔNG có endpoint tìm kiếm người dùng công khai cho
 *   ứng dụng bên thứ ba — chỉ đọc dữ liệu của tài khoản đã cấp quyền OAuth.
 *
 * Vì vậy ứng dụng này phù hợp nhất để: theo dõi hiệu suất trang/tài khoản
 * của chính bạn, và làm nền cho việc nhập thủ công + phân tích khách hàng
 * tiềm năng, hơn là "tự động quét" toàn bộ mạng xã hội.
 *
 * ĐĂNG BÀI TỰ ĐỘNG (publishPost / publishVideo):
 * - Facebook: cần quyền `pages_manage_posts`, chỉ đăng được lên Page mà bạn
 *   quản lý (không đăng lên trang người khác).
 * - Instagram: cần quyền `instagram_content_publish`, bắt buộc phải có ảnh
 *   hoặc video (không đăng được bài chỉ có chữ), và ảnh/video phải là URL
 *   công khai truy cập được.
 * - TikTok: cần quyền `video.publish`; với hầu hết loại app, video được đưa
 *   vào draft/inbox để người dùng tự bấm đăng, chưa chắc đăng công khai
 *   ngay lập tức trừ khi app của bạn được TikTok audit và cấp quyền
 *   "Direct Post".
 */
