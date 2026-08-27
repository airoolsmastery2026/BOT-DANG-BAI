import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { getAIContentHealth, isAIContentServerConfigured } from './ai_content_client';
import { generatePostVariants, generatePostWithAI } from './content_generator';
import {
  POST_STATUS,
  RECURRENCE,
  cancelPost,
  checkAndPublishDuePosts,
  deletePost,
  getScheduledPosts,
  schedulePost,
} from './post_manager';
import { clearSchedulerHandoff, loadSchedulerHandoff } from './scheduler_handoff';
import {
  createDesktopWorkerJob,
  isDesktopPublishingWorkerAvailable,
  listDesktopWorkerJobs,
  processDesktopWorkerJobs,
  retryDesktopWorkerJob,
} from './desktop_publishing_worker';

const STATUS_LABELS = {
  [POST_STATUS.SCHEDULED]: { label: 'Đã lên lịch', color: 'bg-blue-600' },
  [POST_STATUS.PUBLISHING]: { label: 'Đang đăng...', color: 'bg-yellow-600' },
  [POST_STATUS.PUBLISHED]: { label: 'Đã đăng', color: 'bg-green-600' },
  [POST_STATUS.FAILED]: { label: 'Thất bại', color: 'bg-red-600' },
  [POST_STATUS.DEAD_LETTER]: { label: 'Dead Letter', color: 'bg-orange-700' },
  [POST_STATUS.CANCELLED]: { label: 'Đã hủy', color: 'bg-gray-600' },
};

const SUPPORTED_PLATFORMS = ['facebook', 'instagram', 'tiktok', 'linkedin', 'pinterest', 'youtube'];
const DIRECT_PLATFORMS = new Set(['facebook', 'instagram', 'tiktok']);
const PERSISTENT_PLATFORMS = new Set(['linkedin', 'pinterest', 'youtube']);

const toDatetimeLocal = (isoOrNull) => {
  const date = isoOrNull ? new Date(isoOrNull) : new Date(Date.now() + 5 * 60_000);
  const validDate = Number.isNaN(date.getTime()) ? new Date(Date.now() + 5 * 60_000) : date;
  const pad = (value) => String(value).padStart(2, '0');
  return `${validDate.getFullYear()}-${pad(validDate.getMonth() + 1)}-${pad(validDate.getDate())}T${pad(validDate.getHours())}:${pad(validDate.getMinutes())}`;
};

const isValidHttpUrl = (value) => {
  if (!value.trim()) return true;
  try {
    const url = new URL(value.trim());
    return ['http:', 'https:'].includes(url.protocol);
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
  const [campaignContext, setCampaignContext] = useState(null);

  const [tone, setTone] = useState('neutral');
  const [length, setLength] = useState('medium');
  const [emojiLevel, setEmojiLevel] = useState('light');
  const [hashtags, setHashtags] = useState('');
  const [cta, setCta] = useState('');
  const [variants, setVariants] = useState([]);
  const [generating, setGenerating] = useState(false);
  const [showAiSettings, setShowAiSettings] = useState(false);
  const [aiHealth, setAiHealth] = useState(null);

  const [posts, setPosts] = useState(getScheduledPosts());
  const [workerJobs, setWorkerJobs] = useState([]);
  const [autoPublishOn, setAutoPublishOn] = useState(false);
  const [lastCheck, setLastCheck] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [notice, setNotice] = useState(null);

  const aiServerConfigured = isAIContentServerConfigured();

  const connectedList = useMemo(
    () => Object.entries(connectedPlatforms).filter(([, enabled]) => enabled).map(([key]) => key),
    [connectedPlatforms],
  );

  const availablePlatforms = useMemo(
    () => SUPPORTED_PLATFORMS.filter((platform) => connectedPlatforms[platform]),
    [connectedPlatforms],
  );

  const desktopWorkerAvailable = isDesktopPublishingWorkerAvailable();
  const refreshWorkerJobs = useCallback(async () => {
    if (!desktopWorkerAvailable) return [];
    const jobs = await listDesktopWorkerJobs();
    const normalized = (Array.isArray(jobs) ? jobs : []).map((job) => ({ ...job, queueSource: 'persistent-worker' }));
    setWorkerJobs(normalized);
    return normalized;
  }, [desktopWorkerAvailable]);
  const refreshPosts = useCallback(() => {
    setPosts(getScheduledPosts());
    if (desktopWorkerAvailable) void refreshWorkerJobs().catch(() => undefined);
  }, [desktopWorkerAvailable, refreshWorkerJobs]);
  const showNotice = (type, message) => setNotice({ type, message });

  useEffect(() => {
    if (!desktopWorkerAvailable) return;
    void refreshWorkerJobs().catch((error) => setNotice({ type: 'error', message: error.message || 'Không thể đọc hàng đợi worker.' }));
  }, [desktopWorkerAvailable, refreshWorkerJobs]);

  useEffect(() => {
    const handoff = loadSchedulerHandoff();
    if (!handoff) return;

    setCampaignContext(handoff);
    setTopic(handoff.topic);
    setContent(handoff.content || '');
    setImageUrl(handoff.imageUrl || '');
    setVideoUrl(handoff.videoUrl || '');
    setPlatforms(handoff.platforms.filter((platform) => connectedPlatforms[platform]));
    if (handoff.publishAt) setScheduledTime(toDatetimeLocal(handoff.publishAt));
    clearSchedulerHandoff();

    const unavailable = handoff.platforms.filter((platform) => !connectedPlatforms[platform]);
    showNotice(
      unavailable.length ? 'info' : 'success',
      unavailable.length
        ? `Đã nạp chiến dịch ${handoff.campaignId}. Chưa thể chọn: ${unavailable.join(', ')} vì chưa kết nối.`
        : `Đã nạp chiến dịch ${handoff.campaignId} vào trình lên lịch.`,
    );
  }, [connectedPlatforms]);

  const togglePlatform = (platform) => {
    setPlatforms((current) => (
      current.includes(platform)
        ? current.filter((item) => item !== platform)
        : [...current, platform]
    ));
    setNotice(null);
  };

  const validateComposer = (postNow = false) => {
    if (!content.trim()) return 'Nội dung bài đăng không được để trống.';
    if (platforms.length === 0) return 'Hãy chọn ít nhất một nền tảng đã kết nối.';
    if (!postNow) {
      const time = new Date(scheduledTime);
      if (Number.isNaN(time.getTime())) return 'Thời gian đăng không hợp lệ.';
      if (time.getTime() < Date.now() - 60_000) return 'Thời gian lên lịch phải ở hiện tại hoặc tương lai.';
    }
    if (!isValidHttpUrl(imageUrl)) return 'URL ảnh không hợp lệ.';
    if (!isValidHttpUrl(videoUrl)) return 'URL video không hợp lệ.';
    if (platforms.includes('instagram') && !imageUrl.trim()) return 'Instagram yêu cầu URL ảnh.';
    if (platforms.includes('pinterest') && !imageUrl.trim()) return 'Pinterest yêu cầu URL ảnh.';
    if (platforms.includes('tiktok') && !videoUrl.trim()) return 'TikTok yêu cầu URL video.';
    if (platforms.includes('youtube') && !videoUrl.trim()) return 'YouTube/Shorts yêu cầu URL video.';
    if (platforms.includes('youtube') && !topic.trim()) return 'YouTube/Shorts yêu cầu chủ đề để làm tiêu đề video.';
    if (platforms.some((platform) => PERSISTENT_PLATFORMS.has(platform)) && !desktopWorkerAvailable) {
      return 'LinkedIn, Pinterest và YouTube cần bản desktop có Publishing Worker tích hợp.';
    }
    if (platforms.some((platform) => PERSISTENT_PLATFORMS.has(platform)) && recurrence !== RECURRENCE.NONE) {
      return 'Tác vụ worker 24/7 chưa hỗ trợ lịch lặp; hãy tạo từng mốc lịch từ chiến dịch để giữ idempotency.';
    }
    return null;
  };

  const contentOptions = () => ({
    tone,
    length,
    emojiLevel,
    hashtags: hashtags.split(',').map((item) => item.trim()).filter(Boolean),
    hashtagCount: hashtags.split(',').map((item) => item.trim()).filter(Boolean).length || 3,
    cta,
  });

  const handleGenerateVariants = () => {
    if (!topic.trim()) return showNotice('error', 'Hãy nhập chủ đề trước khi tạo nội dung.');
    setGenerating(true);
    setNotice(null);
    try {
      setVariants(generatePostVariants(topic.trim(), contentOptions(), 3));
    } catch (error) {
      showNotice('error', error.message || 'Không thể tạo phương án nội dung.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAiGenerate = async () => {
    if (!topic.trim()) return showNotice('error', 'Hãy nhập chủ đề trước khi sử dụng AI.');
    setGenerating(true);
    setNotice(null);
    try {
      const text = await generatePostWithAI(topic.trim(), contentOptions());
      setContent(text);
      showNotice('success', 'Đã tạo nội dung bằng AI server-side. Hãy kiểm tra lại trước khi đăng.');
    } catch (error) {
      showNotice('error', error.message || 'Không thể tạo nội dung bằng AI.');
    } finally {
      setGenerating(false);
    }
  };

  const handleAiHealth = async () => {
    setGenerating(true);
    setNotice(null);
    try {
      const health = await getAIContentHealth();
      setAiHealth(health);
      if (!health.gatewayConfigured || health.status === 'disabled') {
        showNotice('info', 'AI Content Server chưa được cấu hình cho giao diện này.');
      } else if (!health.serverConfigured) {
        showNotice('error', 'AI Content Server đang chạy nhưng Gemini provider chưa sẵn sàng. Kiểm tra GEMINI_API_KEY trên server.');
      } else {
        showNotice('success', `AI Content Server hoạt động · ${health.model || 'Gemini'}.`);
      }
    } catch (error) {
      setAiHealth({ gatewayConfigured: true, serverConfigured: false, status: 'offline', error: error?.message });
      showNotice('error', error?.message || 'Không thể kết nối AI Content Server.');
    } finally {
      setGenerating(false);
    }
  };

  const handleSchedule = async (postNow = false) => {
    const validationError = validateComposer(postNow);
    if (validationError) return showNotice('error', validationError);

    setProcessing(true);
    setNotice(null);
    try {
      const scheduledAt = postNow ? new Date().toISOString() : new Date(scheduledTime).toISOString();
      const directPlatforms = platforms.filter((platform) => DIRECT_PLATFORMS.has(platform));
      const persistentPlatforms = platforms.filter((platform) => PERSISTENT_PLATFORMS.has(platform));
      const basePost = {
        content: content.trim(),
        scheduledTime: scheduledAt,
        imageUrl: imageUrl.trim(),
        videoUrl: videoUrl.trim(),
        targetIds: {
          facebook: targetIds.facebook.trim(),
          instagram: targetIds.instagram.trim(),
        },
        campaignId: campaignContext?.campaignId || null,
      };

      if (persistentPlatforms.length) {
        await createDesktopWorkerJob({
          ...basePost,
          platforms: persistentPlatforms,
          title: topic.trim().slice(0, 100),
          privacyStatus: 'private',
        });
      }
      if (directPlatforms.length) {
        schedulePost({ ...basePost, platforms: directPlatforms, recurrence });
      }

      if (postNow) {
        const directProcessed = directPlatforms.length ? await checkAndPublishDuePosts(apiCredentials) : [];
        const workerProcessed = persistentPlatforms.length ? await processDesktopWorkerJobs() : { processed: [] };
        setLastCheck(new Date());
        const processed = [...directProcessed, ...(workerProcessed?.processed || [])];
        const failed = processed.some((post) => [POST_STATUS.FAILED, POST_STATUS.DEAD_LETTER].includes(post.status));
        showNotice(failed ? 'error' : 'success', failed
          ? 'Đã xử lý nhưng có nền tảng đăng thất bại. Kiểm tra lịch sử.'
          : `Đã xử lý yêu cầu đăng ngay qua ${persistentPlatforms.length ? 'Persistent Worker' : 'hàng đợi cục bộ'}.`);
      } else {
        showNotice('success', persistentPlatforms.length
          ? 'Đã thêm bài vào Persistent Worker; ứng dụng tiếp tục xử lý khi thu nhỏ xuống khay hệ thống.'
          : 'Đã thêm bài vào hàng đợi.');
      }

      setContent('');
      setVariants([]);
      setPlatforms([]);
      setCampaignContext(null);
      setScheduledTime(toDatetimeLocal());
      refreshPosts();
    } catch (error) {
      showNotice('error', error.message || 'Không thể lưu bài đăng.');
    } finally {
      setProcessing(false);
    }
  };

  const handleManualCheck = async () => {
    setProcessing(true);
    setNotice(null);
    try {
      const directProcessed = await checkAndPublishDuePosts(apiCredentials);
      const workerResult = desktopWorkerAvailable ? await processDesktopWorkerJobs() : { processed: [] };
      const processed = [...directProcessed, ...(workerResult?.processed || [])];
      setLastCheck(new Date());
      refreshPosts();
      showNotice(processed.length ? 'success' : 'info', processed.length
        ? `Đã xử lý ${processed.length} tác vụ đến hạn.`
        : 'Không có bài nào đến hạn.');
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
  }, [autoPublishOn, apiCredentials, refreshPosts]);

  const allPosts = useMemo(() => [...posts, ...workerJobs], [posts, workerJobs]);
  const upcoming = useMemo(() => allPosts
    .filter((post) => post.status === POST_STATUS.SCHEDULED)
    .sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime)), [allPosts]);
  const history = useMemo(() => allPosts
    .filter((post) => post.status !== POST_STATUS.SCHEDULED)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)), [allPosts]);

  return (
    <div className="space-y-8">
      {notice && (
        <div role="status" className={`rounded-lg border p-4 text-sm ${notice.type === 'success' ? 'border-green-700 bg-green-900/30 text-green-200' : notice.type === 'info' ? 'border-blue-700 bg-blue-900/30 text-blue-200' : 'border-red-700 bg-red-900/30 text-red-200'}`}>
          <div className="flex items-start justify-between gap-3"><span>{notice.message}</span><button type="button" onClick={() => setNotice(null)} aria-label="Đóng thông báo">×</button></div>
        </div>
      )}

      {campaignContext && (
        <div className="rounded-lg border border-purple-700 bg-purple-900/30 p-4 text-sm text-purple-100">
          <strong>Chiến dịch: {campaignContext.campaignId}</strong>
          <p className="mt-1">{campaignContext.topic}</p>
          <p className="mt-1 text-purple-300">Workflow yêu cầu: {campaignContext.hasImageJob ? 'ảnh' : ''}{campaignContext.hasImageJob && campaignContext.hasVideoJob ? ' + ' : ''}{campaignContext.hasVideoJob ? 'video' : ''}.</p>
        </div>
      )}

      {connectedList.length === 0 && <div className="rounded-lg border border-yellow-700 bg-yellow-900/40 p-4 text-sm text-yellow-200">Chưa có nền tảng nào được kết nối.</div>}

      <div className="rounded-lg border border-gray-700 bg-gradient-to-br from-gray-800 to-gray-900 p-4 md:p-6">
        <h2 className="mb-4 flex items-center gap-2 text-2xl font-bold"><Wand2 className="h-6 w-6" /> Soạn nội dung và lên lịch</h2>

        <div className="mb-4 grid grid-cols-1 gap-4 md:grid-cols-4">
          <input value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="Chủ đề bài viết" className="rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm" />
          <select value={tone} onChange={(event) => setTone(event.target.value)} className="rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm"><option value="neutral">Trung tính</option><option value="urgent">Thúc đẩy hành động</option><option value="friendly">Thân thiện</option></select>
          <select value={length} onChange={(event) => setLength(event.target.value)} className="rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm"><option value="short">Ngắn</option><option value="medium">Vừa</option><option value="long">Dài</option></select>
          <select value={emojiLevel} onChange={(event) => setEmojiLevel(event.target.value)} className="rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm"><option value="none">Không emoji</option><option value="light">Emoji vừa phải</option><option value="heavy">Nhiều emoji</option></select>
          <input value={hashtags} onChange={(event) => setHashtags(event.target.value)} placeholder="Hashtag, phân cách bằng dấu phẩy" className="rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm md:col-span-2" />
          <input value={cta} onChange={(event) => setCta(event.target.value)} placeholder="Câu kêu gọi hành động" className="rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm md:col-span-2" />
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          <button type="button" onClick={handleGenerateVariants} disabled={!topic.trim() || generating} className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 text-sm disabled:opacity-40">{generating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />} Tạo 3 phương án miễn phí</button>
          <button type="button" onClick={handleAiGenerate} disabled={!topic.trim() || generating || !aiServerConfigured} className="flex items-center gap-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm disabled:opacity-40"><Wand2 className="h-4 w-4" /> Viết bằng AI</button>
          <button type="button" onClick={() => setShowAiSettings((value) => !value)} className="flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm"><Settings2 className="h-4 w-4" /> Trạng thái AI</button>
        </div>

        {showAiSettings && (
          <div className="mb-4 rounded-lg border border-gray-700 bg-gray-900 p-4 text-sm">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-semibold text-gray-100">AI chạy qua server-side gateway</p>
                <p className="mt-1 text-xs text-gray-400">Không nhập hoặc lưu Gemini/OpenAI/Anthropic API key trong trình duyệt.</p>
                <p className={`mt-2 text-xs ${aiServerConfigured ? 'text-emerald-300' : 'text-amber-300'}`}>{aiServerConfigured ? 'Đã cấu hình địa chỉ AI Content Server.' : 'Chưa cấu hình REACT_APP_DHP_AI_CONTENT_URL; template miễn phí vẫn hoạt động.'}</p>
                {aiHealth?.gatewayConfigured && <p className={`mt-1 text-xs ${aiHealth.serverConfigured ? 'text-emerald-300' : 'text-amber-300'}`}>Gateway: online · Provider: {aiHealth.serverConfigured ? 'ready' : 'chưa sẵn sàng'}</p>}
                {aiHealth?.model && <p className="mt-1 text-xs text-sky-300">Model server: {aiHealth.model}</p>}
              </div>
              <button type="button" onClick={handleAiHealth} disabled={generating || !aiServerConfigured} className="rounded-lg bg-slate-700 px-3 py-2 font-semibold hover:bg-slate-600 disabled:opacity-40">Kiểm tra AI Server</button>
            </div>
          </div>
        )}

        {variants.length > 0 && <div className="mb-4 grid gap-3 md:grid-cols-3">{variants.map((variant, index) => <button type="button" key={`${index}-${variant.slice(0, 20)}`} onClick={() => setContent(variant)} className="rounded-lg border border-gray-700 bg-gray-900 p-3 text-left text-xs whitespace-pre-wrap">{variant}</button>)}</div>}

        <textarea value={content} onChange={(event) => setContent(event.target.value)} rows={6} maxLength={5000} placeholder="Nội dung bài đăng" className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2 text-sm" />
        <p className="mb-4 text-right text-xs text-gray-500">{content.length}/5000 ký tự</p>

        <div className="mb-4 grid gap-4 md:grid-cols-2"><input value={imageUrl} onChange={(event) => setImageUrl(event.target.value)} placeholder="URL ảnh" className="rounded bg-gray-700 px-3 py-2" /><input value={videoUrl} onChange={(event) => setVideoUrl(event.target.value)} placeholder="URL video" className="rounded bg-gray-700 px-3 py-2" /></div>

        <div className="mb-4 flex flex-wrap gap-2">{SUPPORTED_PLATFORMS.map((platform) => <button type="button" key={platform} disabled={!connectedPlatforms[platform]} onClick={() => togglePlatform(platform)} aria-pressed={platforms.includes(platform)} className={`rounded-lg px-4 py-2 text-sm capitalize ${platforms.includes(platform) ? 'bg-purple-600' : 'bg-gray-700'} ${!connectedPlatforms[platform] ? 'cursor-not-allowed opacity-30' : ''}`}>{platform}</button>)}</div>
        {availablePlatforms.length === 0 && <p className="mb-4 text-xs text-yellow-300">Hãy kết nối và xác minh ít nhất một tài khoản trước khi lên lịch.</p>}

        <div className="mb-4 grid gap-4 md:grid-cols-2"><input value={targetIds.facebook} onChange={(event) => setTargetIds((current) => ({ ...current, facebook: event.target.value }))} placeholder="Facebook Page ID (tùy chọn ghi đè)" className="rounded bg-gray-700 px-3 py-2" /><input value={targetIds.instagram} onChange={(event) => setTargetIds((current) => ({ ...current, instagram: event.target.value }))} placeholder="Instagram Business ID (tùy chọn ghi đè)" className="rounded bg-gray-700 px-3 py-2" /></div>

        <div className="mb-4 grid gap-4 md:grid-cols-3"><label className="text-xs text-gray-400"><Calendar className="mr-1 inline h-3 w-3" />Thời gian đăng<input type="datetime-local" value={scheduledTime} min={toDatetimeLocal(new Date())} onChange={(event) => setScheduledTime(event.target.value)} className="mt-1 w-full rounded bg-gray-700 px-3 py-2 text-sm text-white" /></label><label className="text-xs text-gray-400"><Repeat className="mr-1 inline h-3 w-3" />Lặp lại<select value={recurrence} onChange={(event) => setRecurrence(event.target.value)} className="mt-1 w-full rounded bg-gray-700 px-3 py-2 text-sm text-white"><option value={RECURRENCE.NONE}>Không lặp</option><option value={RECURRENCE.DAILY}>Hàng ngày</option><option value={RECURRENCE.WEEKLY}>Hàng tuần</option></select></label></div>

        <div className="flex flex-wrap gap-2"><button type="button" onClick={() => handleSchedule(false)} disabled={processing} className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm disabled:opacity-40"><Clock className="h-4 w-4" /> Lên lịch đăng</button><button type="button" onClick={() => handleSchedule(true)} disabled={processing} className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm disabled:opacity-40"><Send className="h-4 w-4" /> Đăng ngay</button></div>
      </div>

      <div className="rounded-lg border border-gray-700 bg-gray-800 p-4">
        <div className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><button type="button" role="switch" aria-checked={autoPublishOn} onClick={() => setAutoPublishOn((value) => !value)} className={`h-8 w-14 rounded-full ${autoPublishOn ? 'bg-green-600' : 'bg-gray-600'}`}><span className={`m-1 block h-6 w-6 rounded-full bg-white transition ${autoPublishOn ? 'translate-x-6' : ''}`} /></button><div><p className="font-medium">Tự động xử lý bài đến hạn trong phiên</p><p className="text-xs text-gray-400">Kiểm tra mỗi 60 giây · {lastCheck ? lastCheck.toLocaleTimeString('vi-VN') : 'chưa chạy'}</p></div></div><button type="button" onClick={handleManualCheck} disabled={processing} className="rounded-lg bg-gray-700 px-4 py-2 text-sm">Kiểm tra hàng đợi</button></div>
        <p className="mt-3 text-xs text-amber-300">Lưu ý: bộ kiểm tra 60 giây chạy trong trình duyệt và chỉ hoạt động khi trang đang mở.</p>
      </div>

      <section><h3 className="mb-3 flex items-center gap-2 text-xl font-bold"><Clock className="h-5 w-5" /> Hàng đợi ({upcoming.length})</h3>{upcoming.length === 0 ? <p className="text-sm text-gray-400">Chưa có bài nào được lên lịch.</p> : <div className="space-y-3">{upcoming.map((post) => <article key={`${post.queueSource || 'browser'}-${post.id}`} className="flex gap-4 rounded-lg border border-gray-700 bg-gray-800 p-4"><div className="min-w-0 flex-1"><p className="line-clamp-3 whitespace-pre-wrap text-sm">{post.content}</p><p className="mt-2 text-xs text-gray-400">{new Date(post.scheduledTime).toLocaleString('vi-VN')} · {post.platforms.join(', ')} · {post.queueSource === 'persistent-worker' ? 'Worker 24/7' : 'Phiên ứng dụng'}</p></div>{post.queueSource !== 'persistent-worker' && <><button type="button" onClick={() => { cancelPost(post.id); refreshPosts(); }} aria-label="Hủy bài" className="text-yellow-400"><XCircle className="h-5 w-5" /></button><button type="button" onClick={() => { deletePost(post.id); refreshPosts(); }} aria-label="Xóa bài" className="text-red-400"><Trash2 className="h-5 w-5" /></button></>}</article>)}</div>}</section>

      <section><h3 className="mb-3 text-xl font-bold">Lịch sử</h3>{history.length === 0 ? <p className="text-sm text-gray-400">Chưa có bài nào được xử lý.</p> : <div className="space-y-3">{history.map((post) => { const statusInfo = STATUS_LABELS[post.status] || STATUS_LABELS[POST_STATUS.SCHEDULED]; return <article key={`${post.queueSource || 'browser'}-${post.id}`} className="flex gap-4 rounded-lg border border-gray-700 bg-gray-800 p-4"><div className="min-w-0 flex-1"><div className="mb-1 flex items-center gap-2"><span className={`rounded-full px-2 py-0.5 text-xs ${statusInfo.color}`}>{statusInfo.label}</span>{post.queueSource === 'persistent-worker' && <span className="rounded-full bg-sky-900 px-2 py-0.5 text-xs text-sky-200">Worker 24/7</span>}{[POST_STATUS.FAILED, POST_STATUS.DEAD_LETTER].includes(post.status) && <AlertTriangle className="h-4 w-4 text-red-400" />}{post.status === POST_STATUS.PUBLISHED && <CheckCircle2 className="h-4 w-4 text-green-400" />}</div><p className="line-clamp-2 whitespace-pre-wrap text-sm">{post.content}</p>{post.results && Object.entries(post.results).map(([platform, result]) => !result.success && <p key={platform} className="mt-1 text-xs text-red-400">{platform}: {result.error}</p>)}</div>{post.queueSource === 'persistent-worker' && [POST_STATUS.FAILED, POST_STATUS.DEAD_LETTER].includes(post.status) ? <button type="button" onClick={async () => { try { await retryDesktopWorkerJob(post.id); await refreshWorkerJobs(); showNotice('success', 'Đã đưa job worker vào hàng đợi retry.'); } catch (error) { showNotice('error', error.message || 'Không thể retry job.'); } }} aria-label="Retry job worker" className="text-amber-300"><Repeat className="h-5 w-5" /></button> : post.queueSource !== 'persistent-worker' && <button type="button" onClick={() => { deletePost(post.id); refreshPosts(); }} aria-label="Xóa lịch sử" className="text-red-400"><Trash2 className="h-5 w-5" /></button>}</article>; })}</div>}</section>
    </div>
  );
};

export default PostScheduler;
