export const PLATFORM_CONNECTIONS = Object.freeze([
  {
    id: "facebook",
    label: "Facebook Page",
    tokenKey: "facebook_token",
    tokenLabel: "Page Access Token",
    tokenPlaceholder: "Dán Page Access Token",
    tokenHelp: {
      label: "Lấy Page token",
      href: "https://developers.facebook.com/tools/explorer/",
    },
    targetKey: "facebook_page_id",
    targetLabel: "Facebook Page ID",
    targetPlaceholder: "Ví dụ: 123456789012345",
    targetHelp: {
      label: "Tìm Page ID",
      href: "https://www.facebook.com/help/1503421039731588/",
    },
    portal: {
      label: "Mở Meta App Dashboard",
      href: "https://developers.facebook.com/apps/",
    },
    docs: {
      label: "Tài liệu Pages API",
      href: "https://developers.facebook.com/docs/pages-api/getting-started/",
    },
    query: "/me/accounts?fields=id,name,access_token,tasks",
    steps: [
      "Chọn ứng dụng Meta và cấp pages_show_list, pages_read_engagement, pages_manage_posts.",
      "Mở Graph API Explorer rồi chạy truy vấn bên dưới.",
      "Dán id và access_token của đúng Page từ cùng một kết quả.",
    ],
  },
  {
    id: "instagram",
    label: "Instagram Business / Creator",
    tokenKey: "instagram_token",
    tokenLabel: "Instagram Access Token",
    tokenPlaceholder: "Dán Page Access Token có quyền Instagram",
    tokenHelp: {
      label: "Lấy Instagram token",
      href: "https://developers.facebook.com/tools/explorer/",
    },
    targetKey: "instagram_user_id",
    targetLabel: "Instagram Business / Creator ID",
    targetPlaceholder: "Ví dụ: 17841400000000000",
    targetHelp: {
      label: "Lấy Instagram ID",
      href: "https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started/",
    },
    portal: {
      label: "Mở Meta App Dashboard",
      href: "https://developers.facebook.com/apps/",
    },
    docs: {
      label: "Tài liệu Instagram API",
      href: "https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started/",
    },
    query:
      "/me/accounts?fields=id,name,access_token,instagram_business_account",
    steps: [
      "Liên kết tài khoản Instagram Professional với Facebook Page quản lý tài khoản đó.",
      "Cấp instagram_basic, instagram_content_publish và pages_show_list rồi chạy truy vấn bên dưới.",
      "Dán instagram_business_account.id và Page access_token từ cùng một kết quả.",
    ],
  },
  {
    id: "tiktok",
    label: "TikTok",
    tokenKey: "tiktok_token",
    tokenLabel: "User Access Token",
    tokenPlaceholder: "Dán TikTok user access_token",
    tokenHelp: {
      label: "Mở TikTok Apps",
      href: "https://developers.tiktok.com/apps/",
    },
    targetKey: null,
    portal: {
      label: "Tạo hoặc quản lý TikTok App",
      href: "https://developers.tiktok.com/apps/",
    },
    docs: {
      label: "Hướng dẫn OAuth token",
      href: "https://developers.tiktok.com/docs/en/oauth-user-access-token-management",
    },
    steps: [
      "Tạo TikTok App, thêm Login Kit và Content Posting API, sau đó xin scope video.publish.",
      "Hoàn tất OAuth của ứng dụng và đổi authorization code thành user access_token.",
      "Chỉ dán access_token; không dán Client key, Client secret hoặc refresh_token.",
    ],
  },
]);
