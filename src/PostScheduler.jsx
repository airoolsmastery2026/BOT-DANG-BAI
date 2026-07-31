import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Clock,
  Loader2,
  Repeat,
  Send,
  Settings2,
  Trash2,
  Wand2,
  XCircle,
} from 'lucide-react';
import { generatePost, generatePostVariants } from './content_generator';
import {
  POST_STATUS,
  RECURRENCE,
  cancelPost,
  checkAndPublishDuePosts,
  deletePost,
  getScheduledPosts,
  schedulePost,
} from './post_manager';

const STATUS_LABELS = {
  [POST_STATUS.SCHEDULED]: { label: 'Đã lên lịch', color: 'bg-blue-600' },
  [POST_STATUS.PUBLISHING]: { label: 'Đang đăng...', color: 'bg-yellow-600' },
  [POST_STATUS.PUBLISHED]: { label: 'Đã đăng', color: 'bg-green-600' },
  [POST_STATUS.FAILED]: { label: 'Thất bại', color: 'bg-red-600' },
  [POST_STATUS.CANCELLED]: { label: 'Đã hủy', color: 'bg-gray-600' },
};

const SUPPORTED_PLATFORMS = ['facebook', 'instagram', 'tiktok'];

const toDatetimeLocal = (isoOrNull) => {
  const d = isoOrNull ? new Date(isoOrNull) : new Date(Date.now() + 5 * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const isValidHttpUrl = (value) => {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

const PostScheduler = ({ connectedPlatforms = {}, apiCredentials = {} }) => {
  const [content, setContent] = useState('');
  const [topic, setTopic] = useState('');
  const [platforms, setPlatforms] = useState([]);
  const [scheduledTime, setScheduledTime] = useState(toDatetimeLocal());
  const [recurrence, setRecurrence] = useState(RECURRENCE.NONE);
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [targetIds, setTargetIds] = useState({ facebook: '', instagram: '' });

  const [tone, setTone] = useState('neutral');
  const [length, setLength] = useState('medium');
  const [emojiLevel, setEmojiLevel] = useState('light');
  const [hashtags, setHashtags] = useState('');
  const [cta, setCta] = useState('');
  const [variants, setVariants] = useState([]);
  const [generating, setGenerating] = useState(false);

  const [showAiSettings, setShowAiSettings] = useState(false);
  const [aiProvider, setAiProvider] = useState('openai');
  const [aiApiKey, setAiApiKey] = useState('');

  const [posts, setPosts] = useState(getScheduledPosts());
  const [autoPublishOn, setAutoPublishOn] = useState(false);
  const [lastCheck, setLastCheck] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState(null);

  const connectedList = useMemo(
    () => Object.entries(connectedPlatforms).filter(([, enabled]) => enabled).map(([key]) => key),
    [connectedPlatforms]
  );

  const refreshPosts = () => setPosts(getScheduledPosts());

  const showNotice = (type, message) => setNotice({ type, message });

  const togglePlatform = (platform) => {
    setNotice(null);
    setPlatforms((current) => (
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform]
    ));
  };

  const validateComposer = (postNow = false) => {
    if (!content.trim()) return 'Nội dung bài đăng không được để trống.';
    if (platforms.length === 0) return 'Hãy chọn ít nhất một nền tảng.';
    if (!postNow) {
      const time = new Date(scheduledTime);
      if (Number.isNaN(time.getTime())) return 'Thời gian đăng không hợp lệ.';
      if (time.getTime() < Date.now() - 60_000) return 'Thời gian lên lịch phải ở hiện tại hoặc tương lai.';
    }
    if (!isValidHttpUrl(imageUrl)) return 'URL ảnh không hợp lệ.';
    if (!isValidHttpUrl(videoUrl)) return 'URL video không hợp lệ.';
    if (platforms.includes('instagram') && !imageUrl.trim()) return 'Instagram yêu cầu URL ảnh.';
    if (platforms.includes('tiktok') && !videoUrl.trim()) return 'TikTok yêu cầu URL video.';
    return null;
  };

  const handleGenerateVariants = () => {
    if (!topic.trim()) {
      showNotice('error', 'Hãy nhập chủ đề trước khi tạo nội dung.');
      return;
    }

    setGenerating(true);
    setNotice(null);
    try {
      const options = {
        tone,
        length,
        emojiLevel,
        hashtags: hashtags.split(',').map((item) => item.trim()).filter(Boolean),
        cta,
      };
      setVariants(generatePostVariants(topic.trim(), options, 3));
    } catch (error) {
      showNotice('error', error.message || 'Không thể tạo phương án nội dung.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!topic.trim()) {
      showNotice('error', 'Hãy nhập chủ đề trước khi sử dụng AI.');
      return;
    }

    setGenerating(true);
    setNotice(null);
    try {
      const text = await generatePost(
        topic.trim(),
        { tone, length, hashtagCount: hashtags.split(',').filter(Boolean).length || 3 },
        aiApiKey ? { provider: aiProvider, apiKey: aiApiKey } : null
      );
      setContent(text);
      showNotice('success', 'Đã tạo nội dung. Hãy kiểm tra lại trước khi đăng.');
    } catch (error) {
      showNotice('error', error.message || 'Không thể tạo nội dung bằng AI.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSchedule = async (postNow = false) => {
    const validationError = validateComposer(postNow);
    if (validationError) {
      showNotice('error', validationError);
      return;
    }

    setProcessing(true);
    setNotice(null);
    try {
      schedulePost({
        content: content.trim(),
        platforms,
        scheduledTime: postNow ? new Date().toISOString() : new Date(scheduledTime).toISOString(),
        imageUrl: imageUrl.trim(),
        videoUrl: videoUrl.trim(),
        recurrence,
        targetIds: {
          facebook: targetIds.facebook.trim(),
          instagram: targetIds.instagram.trim(),
        },
      });

      if (postNow) {
        const processed = await checkAndPublishDuePosts(apiCredentials);
        setLastCheck(new Date());
        const failed = processed.some((post) => post.status === POST_STATUS.FAILED);
        showNotice(
          failed ? 'error' : 'success',
          failed ? 'Đã xử lý nhưng có nền tảng đăng thất bại. Kiểm tra phần Lịch sử.' : 'Đã xử lý yêu cầu đăng ngay.'
        );
      } else {
        showNotice('success', 'Đã thêm bài vào hàng đợi.');
      }

      setContent('');
      setVariants([]);
      setPlatforms([]);
      setScheduledTime(toDatetimeLocal());
      refreshPosts();
    } catch (error) {
      showNotice('error', error.message || 'Không thể lưu bài đăng.');
    } finally {
      setProcessing(false);
    }
  };

  const handleCancel = (id) => {
    cancelPost(id);
    refreshPosts();
    showNotice('success', 'Đã hủy bài khỏi lịch đăng.');
  };

  const handleDelete = (id) => {
    deletePost(id);
    refreshPosts();
    showNotice('success', 'Đã xóa bài đăng.');
  };

  const handleManualCheck = async () => {
    setProcessing(true);
    setNotice(null);
    try {
      const processed = await checkAndPublishDuePosts(apiCredentials);
      setLastCheck(new Date());
      refreshPosts();
      showNotice(
        processed.length ? 'success' : 'info',
        processed.length ? `Đã xử lý ${processed.length} tác vụ đến hạn.` : 'Không có bài nào đến hạn.'
      );
    } catch (error) {
      showNotice('error', error.message || 'Không thể kiểm tra hàng đợi.');
    } finally {
      setProcessing(false);
    }
  };

  useEffect(() => {
    if (!autoPublishOn) return undefined;
    const interval = setInterval(async () => {
      try {
        await checkAndPublishDuePosts(apiCredentials);
        setLastCheck(new Date());
        refreshPosts();
      } catch (error) {
        showNotice('error', error.message || 'Tự động kiểm tra hàng đợi thất bại.');
      }
    }, 60_000);
    return () => clearInterval(interval);
  }, [autoPublishOn, apiCredentials]);

  const upcoming = useMemo(
    () => posts
      .filter((post) => post.status === POST_STATUS.SCHEDULED)
      .sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()),
    [posts]
  );

  const history = useMemo(
    () => posts
      .filter((post) => post.status !== POST_STATUS.SCHEDULED)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [posts]
  );

  return (
    <div className="space-y-8">
      {notice && (
        <div
          role="status"
          className={`rounded-lg border p-4 text-sm ${
            notice.type === 'success'
              ? 'border-green-700 bg-green-900/30 text-green-200'
              : notice.type === 'info'
                ? 'border-blue-700 bg-blue-900/30 text-blue-200'
                : 'border-red-700 bg-red-900/30 text-red-200'
          }`}
        >
          <div className="flex items-start justify-between gap-3">
            <span>{notice.message}</span>
            <button type="button" onClick={() => setNotice(null)} aria-label="Đóng thông báo" className="opacity-70 hover:opacity-100">×</button>
          </div>
        </div>
      )}

      {connectedList.length === 0 && (
        <div className="bg-yellow-900/40 border border-yellow-700 rounded-lg p-4 text-sm text-yellow-200">
          Chưa có nền tảng nào được kết nối. Hãy cấu hình thông tin xác thực trước khi đăng bài.
        </div>
      )}

      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-4 md:p-6 border border-gray-700">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Wand2 className="w-6 h-6" /> Soạn nội dung và lên lịch
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="post-topic">Chủ đề bài viết</label>
            <input id="post-topic" value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="VD: khuyến mãi tủ bếp tháng 8" className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="post-tone">Giọng văn</label>
            <select id="post-tone" value={tone} onChange={(event) => setTone(event.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
              <option value="neutral">Trung tính</option>
              <option value="urgent">Thúc đẩy hành động</option>
              <option value="friendly">Thân thiện</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="post-length">Độ dài</label>
            <select id="post-length" value={length} onChange={(event) => setLength(event.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
              <option value="short">Ngắn</option>
              <option value="medium">Vừa</option>
              <option value="long">Dài</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1" htmlFor="post-emoji">Emoji</label>
            <select id="post-emoji" value={emojiLevel} onChange={(event) => setEmojiLevel(event.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
              <option value="none">Không</option>
              <option value="light">Vừa phải</option>
              <option value="heavy">Nhiều</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-400 mb-1" htmlFor="post-hashtags">Hashtag</label>
            <input id="post-hashtags" value={hashtags} onChange={(event) => setHashtags(event.target.value)} placeholder="noithat, tubep, khuyenmai" className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm" />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-400 mb-1" htmlFor="post-cta">Câu kêu gọi hành động</label>
            <input id="post-cta" value={cta} onChange={(event) => setCta(event.target.value)} placeholder="Để trống để hệ thống tự chọn" className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm" />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button type="button" onClick={handleGenerateVariants} disabled={!topic.trim() || generating} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Tạo 3 phương án
          </button>
          <button type="button" onClick={handleAiGenerate} disabled={!topic.trim() || generating} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
            {generating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Wand2 className="w-4 h-4" />} Viết bằng AI
          </button>
          <button type="button" onClick={() => setShowAiSettings((value) => !value)} aria-expanded={showAiSettings} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
            <Settings2 className="w-4 h-4" /> Cấu hình AI
          </button>
        </div>

        {showAiSettings && (
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1" htmlFor="ai-provider">Nhà cung cấp AI</label>
              <select id="ai-provider" value={aiProvider} onChange={(event) => setAiProvider(event.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-400 mb-1" htmlFor="ai-api-key">API key chỉ giữ trong phiên trình duyệt</label>
              <input id="ai-api-key" type="password" autoComplete="off" value={aiApiKey} onChange={(event) => setAiApiKey(event.target.value)} placeholder="Nhập API key" className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm" />
            </div>
          </div>
        )}

        {variants.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {variants.map((variant, index) => (
              <button type="button" key={`${index}-${variant.slice(0, 20)}`} onClick={() => setContent(variant)} className="text-left bg-gray-900 hover:bg-gray-700 border border-gray-700 rounded-lg p-3 text-xs whitespace-pre-wrap">
                {variant}
              </button>
            ))}
          </div>
        )}

        <label className="sr-only" htmlFor="post-content">Nội dung bài đăng</label>
        <textarea id="post-content" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Nội dung bài đăng" rows="5" maxLength={5000} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm mb-1" />
        <p className="text-xs text-gray-500 text-right mb-4">{content.length}/5000 ký tự</p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="URL ảnh (bắt buộc cho Instagram)" className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm" />
          <input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="URL video (bắt buộc cho TikTok)" className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm" />
        </div>

        <div className="flex flex-wrap gap-2 mb-4" aria-label="Chọn nền tảng đăng bài">
          {SUPPORTED_PLATFORMS.map((platform) => (
            <button type="button" key={platform} disabled={!connectedPlatforms[platform]} onClick={() => togglePlatform(platform)} aria-pressed={platforms.includes(platform)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${platforms.includes(platform) ? 'bg-purple-600' : 'bg-gray-700 text-gray-400'} ${!connectedPlatforms[platform] ? 'opacity-30 cursor-not-allowed' : 'hover:bg-purple-500'}`}>
              {platform}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <input value={targetIds.facebook} onChange={(event) => setTargetIds((current) => ({ ...current, facebook: event.target.value }))} placeholder="Facebook Page ID (để trống = me)" className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm" />
          <input value={targetIds.instagram} onChange={(event) => setTargetIds((current) => ({ ...current, instagram: event.target.value }))} placeholder="Instagram Business Account ID" className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1" htmlFor="scheduled-time"><Calendar className="w-3 h-3" /> Thời gian đăng</label>
            <input id="scheduled-time" type="datetime-local" value={scheduledTime} min={toDatetimeLocal(new Date())} onChange={(event) => setScheduledTime(event.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1" htmlFor="recurrence"><Repeat className="w-3 h-3" /> Lặp lại</label>
            <select id="recurrence" value={recurrence} onChange={(event) => setRecurrence(event.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
              <option value={RECURRENCE.NONE}>Không lặp</option>
              <option value={RECURRENCE.DAILY}>Hàng ngày</option>
              <option value={RECURRENCE.WEEKLY}>Hàng tuần</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={() => handleSchedule(false)} disabled={processing} className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />} Lên lịch đăng
          </button>
          <button type="button" onClick={() => handleSchedule(true)} disabled={processing} className="bg-green-600 hover:bg-green-700 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2">
            {processing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Đăng ngay
          </button>
        </div>
      </div>

      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-4 border border-gray-700 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <button type="button" role="switch" aria-checked={autoPublishOn} aria-label="Bật tự động đăng bài đến hạn" onClick={() => setAutoPublishOn((value) => !value)} className={`w-14 h-8 rounded-full transition ${autoPublishOn ? 'bg-green-600' : 'bg-gray-600'}`}>
            <span className={`block w-6 h-6 bg-white rounded-full m-1 transition ${autoPublishOn ? 'translate-x-6' : ''}`} />
          </button>
          <div>
            <p className="font-medium">Tự động đăng bài đến hạn</p>
            <p className="text-xs text-gray-400">Kiểm tra mỗi 60 giây · {lastCheck ? `lần cuối ${lastCheck.toLocaleTimeString('vi-VN')}` : 'chưa chạy'} · chỉ hoạt động khi tab đang mở</p>
          </div>
        </div>
        <button type="button" onClick={handleManualCheck} disabled={processing} className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 px-4 py-2 rounded-lg text-sm flex items-center gap-2">
          {processing && <Loader2 className="w-4 h-4 animate-spin" />} Kiểm tra hàng đợi
        </button>
      </div>

      <div>
        <h3 className="text-xl font-bold mb-3 flex items-center gap-2"><Clock className="w-5 h-5" /> Hàng đợi ({upcoming.length})</h3>
        {upcoming.length === 0 ? (
          <p className="text-gray-400 text-sm">Chưa có bài nào được lên lịch.</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map((post) => (
              <div key={post.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm whitespace-pre-wrap line-clamp-3">{post.content}</p>
                  <p className="text-xs text-gray-400 mt-2">{new Date(post.scheduledTime).toLocaleString('vi-VN')} · {post.platforms.join(', ')}{post.recurrence !== RECURRENCE.NONE && ` · ${post.recurrence === RECURRENCE.DAILY ? 'lặp hàng ngày' : 'lặp hàng tuần'}`}</p>
                </div>
                <div className="flex gap-3 shrink-0">
                  <button type="button" onClick={() => handleCancel(post.id)} className="text-yellow-400 hover:text-yellow-300" aria-label="Hủy bài"><XCircle className="w-5 h-5" /></button>
                  <button type="button" onClick={() => handleDelete(post.id)} className="text-red-400 hover:text-red-300" aria-label="Xóa bài"><Trash2 className="w-5 h-5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="text-xl font-bold mb-3">Lịch sử</h3>
        {history.length === 0 ? (
          <p className="text-gray-400 text-sm">Chưa có bài nào được xử lý.</p>
        ) : (
          <div className="space-y-3">
            {history.map((post) => {
              const statusInfo = STATUS_LABELS[post.status] || STATUS_LABELS[POST_STATUS.SCHEDULED];
              return (
                <div key={post.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
                      {post.status === POST_STATUS.FAILED && <AlertTriangle className="w-4 h-4 text-red-400" />}
                      {post.status === POST_STATUS.PUBLISHED && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                    </div>
                    <p className="text-sm whitespace-pre-wrap line-clamp-2">{post.content}</p>
                    <p className="text-xs text-gray-400 mt-1">{post.platforms.join(', ')}</p>
                    {post.results && Object.entries(post.results).map(([platform, result]) => (
                      !result.success && <p key={platform} className="text-xs text-red-400 mt-1">{platform}: {result.error}</p>
                    ))}
                  </div>
                  <button type="button" onClick={() => handleDelete(post.id)} className="text-red-400 hover:text-red-300 shrink-0" aria-label="Xóa bài khỏi lịch sử"><Trash2 className="w-5 h-5" /></button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default PostScheduler;
