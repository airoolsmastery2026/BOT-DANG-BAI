import React, { useState, useEffect, useMemo } from 'react';
import {
  Wand2, Calendar, Send, Trash2, XCircle, Clock, CheckCircle2,
  AlertTriangle, Repeat, Settings2,
} from 'lucide-react';
import { generatePostVariants, generatePost } from './content_generator';
import {
  schedulePost, cancelPost, deletePost, getScheduledPosts,
  checkAndPublishDuePosts, POST_STATUS, RECURRENCE,
} from './post_manager';

const STATUS_LABELS = {
  [POST_STATUS.SCHEDULED]: { label: 'Đã lên lịch', color: 'bg-blue-600' },
  [POST_STATUS.PUBLISHING]: { label: 'Đang đăng...', color: 'bg-yellow-600' },
  [POST_STATUS.PUBLISHED]: { label: 'Đã đăng', color: 'bg-green-600' },
  [POST_STATUS.FAILED]: { label: 'Thất bại', color: 'bg-red-600' },
  [POST_STATUS.CANCELLED]: { label: 'Đã hủy', color: 'bg-gray-600' },
};

const toDatetimeLocal = (isoOrNull) => {
  const d = isoOrNull ? new Date(isoOrNull) : new Date(Date.now() + 5 * 60000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

const PostScheduler = ({ connectedPlatforms, apiCredentials }) => {
  const [content, setContent] = useState('');
  const [topic, setTopic] = useState('');
  const [platforms, setPlatforms] = useState([]);
  const [scheduledTime, setScheduledTime] = useState(toDatetimeLocal());
  const [recurrence, setRecurrence] = useState(RECURRENCE.NONE);
  const [imageUrl, setImageUrl] = useState('');
  const [videoUrl, setVideoUrl] = useState('');
  const [targetIds, setTargetIds] = useState({ facebook: '', instagram: '' });

  // Bot tinh chỉnh nội dung
  const [tone, setTone] = useState('neutral');
  const [length, setLength] = useState('medium');
  const [emojiLevel, setEmojiLevel] = useState('light');
  const [hashtags, setHashtags] = useState('');
  const [cta, setCta] = useState('');
  const [variants, setVariants] = useState([]);
  const [generating, setGenerating] = useState(false);

  // AI mode (tuỳ chọn)
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [aiProvider, setAiProvider] = useState('openai');
  const [aiApiKey, setAiApiKey] = useState('');

  const [posts, setPosts] = useState(getScheduledPosts());
  const [autoPublishOn, setAutoPublishOn] = useState(false);
  const [lastCheck, setLastCheck] = useState(null);

  const connectedList = Object.entries(connectedPlatforms).filter(([, v]) => v).map(([k]) => k);

  const refreshPosts = () => setPosts(getScheduledPosts());

  const togglePlatform = (p) => {
    setPlatforms(prev => (prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]));
  };

  const handleGenerateVariants = () => {
    if (!topic.trim()) return;
    setGenerating(true);
    const opts = {
      tone,
      length,
      emojiLevel,
      hashtags: hashtags.split(',').map(h => h.trim()).filter(Boolean),
      cta,
    };
    const results = generatePostVariants(topic, opts, 3);
    setVariants(results);
    setGenerating(false);
  };

  const handleAiGenerate = async () => {
    if (!topic.trim()) return;
    setGenerating(true);
    try {
      const text = await generatePost(
        topic,
        { tone, length, hashtagCount: hashtags.split(',').filter(Boolean).length || 3 },
        aiApiKey ? { provider: aiProvider, apiKey: aiApiKey } : null
      );
      setContent(text);
    } catch (error) {
      console.error(error);
    }
    setGenerating(false);
  };

  const handleSchedule = async (postNow = false) => {
    if (!content.trim() || platforms.length === 0) return;

    schedulePost({
      content,
      platforms,
      scheduledTime: postNow ? new Date().toISOString() : new Date(scheduledTime).toISOString(),
      imageUrl,
      videoUrl,
      recurrence,
      targetIds,
    });

    if (postNow) {
      await checkAndPublishDuePosts(apiCredentials);
      setLastCheck(new Date());
    }

    setContent('');
    setVariants([]);
    refreshPosts();
  };

  const handleCancel = (id) => {
    cancelPost(id);
    refreshPosts();
  };

  const handleDelete = (id) => {
    deletePost(id);
    refreshPosts();
  };

  const handleManualCheck = async () => {
    await checkAndPublishDuePosts(apiCredentials);
    setLastCheck(new Date());
    refreshPosts();
  };

  // Auto-publish loop (chỉ chạy khi tab đang mở)
  useEffect(() => {
    if (!autoPublishOn) return undefined;
    const interval = setInterval(async () => {
      await checkAndPublishDuePosts(apiCredentials);
      setLastCheck(new Date());
      refreshPosts();
    }, 60000); // kiểm tra mỗi 60 giây
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPublishOn, apiCredentials]);

  const upcoming = useMemo(
    () => posts.filter(p => p.status === POST_STATUS.SCHEDULED)
      .sort((a, b) => new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()),
    [posts]
  );
  const history = useMemo(
    () => posts.filter(p => p.status !== POST_STATUS.SCHEDULED)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()),
    [posts]
  );

  return (
    <div className="space-y-8">
      {connectedList.length === 0 && (
        <div className="bg-yellow-900/40 border border-yellow-700 rounded-lg p-4 text-sm text-yellow-200">
          Hãy kết nối ít nhất một nền tảng ở tab "Tìm khách hàng" trước khi đăng bài.
        </div>
      )}

      {/* Composer */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-6 border border-gray-700">
        <h2 className="text-2xl font-bold mb-4 flex items-center gap-2">
          <Wand2 className="w-6 h-6" /> Bot Viết Bài & Soạn Nội Dung
        </h2>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Chủ đề bài viết</label>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="VD: khuyến mãi tủ bếp tháng 8"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Giọng văn</label>
            <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
              <option value="neutral">Trung tính</option>
              <option value="urgent">Khẩn cấp / thúc đẩy mua</option>
              <option value="friendly">Thân thiện</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Độ dài</label>
            <select value={length} onChange={(e) => setLength(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
              <option value="short">Ngắn</option>
              <option value="medium">Vừa</option>
              <option value="long">Dài</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1">Emoji</label>
            <select value={emojiLevel} onChange={(e) => setEmojiLevel(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
              <option value="none">Không</option>
              <option value="light">Vừa phải</option>
              <option value="heavy">Nhiều</option>
            </select>
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Hashtag (cách nhau bằng dấu phẩy)</label>
            <input
              value={hashtags}
              onChange={(e) => setHashtags(e.target.value)}
              placeholder="noithat, tubep, khuyenmai"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-xs text-gray-400 mb-1">Câu kêu gọi hành động (CTA, tuỳ chọn)</label>
            <input
              value={cta}
              onChange={(e) => setCta(e.target.value)}
              placeholder="Để trống để bot tự chọn"
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button
            onClick={handleGenerateVariants}
            disabled={!topic.trim() || generating}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Wand2 className="w-4 h-4" /> Tạo 3 phương án (template)
          </button>
          <button
            onClick={handleAiGenerate}
            disabled={!topic.trim() || generating}
            className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Wand2 className="w-4 h-4" /> Viết bằng AI {aiApiKey ? '' : '(chưa có key → dùng template)'}
          </button>
          <button
            onClick={() => setShowAiSettings(!showAiSettings)}
            className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Settings2 className="w-4 h-4" /> Cấu hình AI
          </button>
        </div>

        {showAiSettings && (
          <div className="bg-gray-900 border border-gray-700 rounded-lg p-4 mb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Nhà cung cấp AI</label>
              <select value={aiProvider} onChange={(e) => setAiProvider(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic (Claude)</option>
              </select>
            </div>
            <div className="md:col-span-2">
              <label className="block text-xs text-gray-400 mb-1">API key của bạn (chỉ lưu trong phiên trình duyệt, không gửi đi đâu khác)</label>
              <input
                type="password"
                value={aiApiKey}
                onChange={(e) => setAiApiKey(e.target.value)}
                placeholder="sk-..."
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
              />
            </div>
          </div>
        )}

        {variants.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
            {variants.map((v, idx) => (
              <button
                key={idx}
                onClick={() => setContent(v)}
                className="text-left bg-gray-900 hover:bg-gray-700 border border-gray-700 rounded-lg p-3 text-xs whitespace-pre-wrap"
              >
                {v}
              </button>
            ))}
          </div>
        )}

        <textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          placeholder="Nội dung bài đăng (có thể chỉnh sửa sau khi bot tạo, hoặc tự viết)"
          rows="5"
          className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm mb-4"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <input
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            placeholder="URL ảnh (bắt buộc cho Instagram)"
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
          />
          <input
            value={videoUrl}
            onChange={(e) => setVideoUrl(e.target.value)}
            placeholder="URL video (bắt buộc cho TikTok)"
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          {['facebook', 'instagram', 'tiktok'].map((p) => (
            <button
              key={p}
              disabled={!connectedPlatforms[p]}
              onClick={() => togglePlatform(p)}
              className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition ${
                platforms.includes(p) ? 'bg-purple-600' : 'bg-gray-700 text-gray-400'
              } ${!connectedPlatforms[p] ? 'opacity-30 cursor-not-allowed' : 'hover:bg-purple-500'}`}
            >
              {p}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <input
            value={targetIds.facebook}
            onChange={(e) => setTargetIds({ ...targetIds, facebook: e.target.value })}
            placeholder="Facebook Page ID (để trống = 'me')"
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
          />
          <input
            value={targetIds.instagram}
            onChange={(e) => setTargetIds({ ...targetIds, instagram: e.target.value })}
            placeholder="Instagram Business Account ID (để trống = 'me')"
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1"><Calendar className="w-3 h-3" /> Thời gian đăng</label>
            <input
              type="datetime-local"
              value={scheduledTime}
              onChange={(e) => setScheduledTime(e.target.value)}
              className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs text-gray-400 mb-1 flex items-center gap-1"><Repeat className="w-3 h-3" /> Lặp lại</label>
            <select value={recurrence} onChange={(e) => setRecurrence(e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 text-sm">
              <option value={RECURRENCE.NONE}>Không lặp</option>
              <option value={RECURRENCE.DAILY}>Hàng ngày</option>
              <option value={RECURRENCE.WEEKLY}>Hàng tuần</option>
            </select>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleSchedule(false)}
            disabled={!content.trim() || platforms.length === 0}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Clock className="w-4 h-4" /> Lên lịch đăng
          </button>
          <button
            onClick={() => handleSchedule(true)}
            disabled={!content.trim() || platforms.length === 0}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-40 px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2"
          >
            <Send className="w-4 h-4" /> Đăng ngay
          </button>
        </div>
      </div>

      {/* Auto-publish control */}
      <div className="bg-gradient-to-br from-gray-800 to-gray-900 rounded-lg p-4 border border-gray-700 flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div
            className={`w-14 h-8 rounded-full cursor-pointer transition ${autoPublishOn ? 'bg-green-600' : 'bg-gray-600'}`}
            onClick={() => setAutoPublishOn(!autoPublishOn)}
          >
            <div className={`w-6 h-6 bg-white rounded-full m-1 transition ${autoPublishOn ? 'translate-x-6' : ''}`} />
          </div>
          <div>
            <p className="font-medium">Tự động đăng bài đến hạn</p>
            <p className="text-xs text-gray-400">
              Kiểm tra mỗi 60 giây — {lastCheck ? `lần cuối: ${lastCheck.toLocaleTimeString('vi-VN')}` : 'chưa chạy lần nào'}
              {' · '}chỉ hoạt động khi tab này đang mở
            </p>
          </div>
        </div>
        <button onClick={handleManualCheck} className="bg-gray-700 hover:bg-gray-600 px-4 py-2 rounded-lg text-sm">
          Kiểm tra & đăng ngay bây giờ
        </button>
      </div>

      {/* Upcoming */}
      <div>
        <h3 className="text-xl font-bold mb-3 flex items-center gap-2"><Clock className="w-5 h-5" /> Hàng đợi ({upcoming.length})</h3>
        {upcoming.length === 0 ? (
          <p className="text-gray-400 text-sm">Chưa có bài nào được lên lịch.</p>
        ) : (
          <div className="space-y-3">
            {upcoming.map(p => (
              <div key={p.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <p className="text-sm whitespace-pre-wrap line-clamp-3">{p.content}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {new Date(p.scheduledTime).toLocaleString('vi-VN')} · {p.platforms.join(', ')}
                    {p.recurrence !== RECURRENCE.NONE && ` · lặp lại ${p.recurrence === RECURRENCE.DAILY ? 'hàng ngày' : 'hàng tuần'}`}
                  </p>
                </div>
                <div className="flex gap-2 shrink-0">
                  <button onClick={() => handleCancel(p.id)} className="text-yellow-400 hover:text-yellow-300" title="Hủy">
                    <XCircle className="w-5 h-5" />
                  </button>
                  <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-300" title="Xóa">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* History */}
      <div>
        <h3 className="text-xl font-bold mb-3">Lịch sử</h3>
        {history.length === 0 ? (
          <p className="text-gray-400 text-sm">Chưa có bài nào được xử lý.</p>
        ) : (
          <div className="space-y-3">
            {history.map(p => {
              const statusInfo = STATUS_LABELS[p.status] || STATUS_LABELS[POST_STATUS.SCHEDULED];
              return (
                <div key={p.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs px-2 py-0.5 rounded-full ${statusInfo.color}`}>{statusInfo.label}</span>
                      {p.status === POST_STATUS.FAILED && <AlertTriangle className="w-4 h-4 text-red-400" />}
                      {p.status === POST_STATUS.PUBLISHED && <CheckCircle2 className="w-4 h-4 text-green-400" />}
                    </div>
                    <p className="text-sm whitespace-pre-wrap line-clamp-2">{p.content}</p>
                    <p className="text-xs text-gray-400 mt-1">{p.platforms.join(', ')}</p>
                    {p.results && Object.entries(p.results).map(([platform, r]) => (
                      !r.success && (
                        <p key={platform} className="text-xs text-red-400 mt-1">⚠️ {platform}: {r.error}</p>
                      )
                    ))}
                  </div>
                  <button onClick={() => handleDelete(p.id)} className="text-red-400 hover:text-red-300 shrink-0" title="Xóa">
                    <Trash2 className="w-5 h-5" />
                  </button>
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
