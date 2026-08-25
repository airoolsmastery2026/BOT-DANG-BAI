import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness, Clock, Cloud, Loader2, RefreshCw, Send, Server, Trash2,
} from 'lucide-react';
import {
  createLinkedInPost,
  deleteLinkedInPost,
  getLinkedInHealth,
  getLinkedInPosts,
  processLinkedInPosts,
} from './linkedin_server_api';

const SETTINGS_KEY = 'linkedin_server_settings';
const DEFAULT_SETTINGS = { serverUrl: 'http://localhost:8790', apiKey: '' };
const MAX_CONTENT_LENGTH = 3000;

const loadSettings = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      serverUrl: typeof parsed.serverUrl === 'string' ? parsed.serverUrl : DEFAULT_SETTINGS.serverUrl,
      apiKey: typeof parsed.apiKey === 'string' ? parsed.apiKey : '',
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

const toDatetimeLocal = () => {
  const date = new Date(Date.now() + 5 * 60_000);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const formatDate = (value) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Không rõ thời gian' : date.toLocaleString('vi-VN');
};

const STATUS_LABELS = {
  scheduled: 'Đã lên lịch',
  publishing: 'Đang đăng',
  published: 'Đã đăng',
  failed: 'Thất bại',
};

const normalizePosts = (value) => {
  const items = Array.isArray(value) ? value : [];
  return items.map((post, index) => ({
    ...post,
    id: post?.id || `linkedin-${index}-${post?.createdAt || Date.now()}`,
    content: String(post?.content || post?.commentary || ''),
    status: String(post?.status || 'scheduled').toLowerCase(),
    attempts: Number.isFinite(Number(post?.attempts)) ? Number(post.attempts) : 0,
  })).sort((a, b) => new Date(b.scheduledTime || b.createdAt || 0) - new Date(a.scheduledTime || a.createdAt || 0));
};

const LinkedInControl = () => {
  const saved = useMemo(loadSettings, []);
  const [serverUrl, setServerUrl] = useState(saved.serverUrl);
  const [apiKey, setApiKey] = useState(saved.apiKey);
  const [content, setContent] = useState('');
  const [scheduledTime, setScheduledTime] = useState(toDatetimeLocal());
  const [posts, setPosts] = useState([]);
  const [health, setHealth] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const normalizedServerUrl = serverUrl.trim().replace(/\/$/, '');
  const cleanApiKey = apiKey.trim();

  const validateServerUrl = useCallback(() => {
    if (!normalizedServerUrl) return 'Cần nhập địa chỉ LinkedIn Server.';
    try {
      const url = new URL(normalizedServerUrl);
      if (!['http:', 'https:'].includes(url.protocol)) return 'Địa chỉ server phải dùng HTTP hoặc HTTPS.';
    } catch {
      return 'Địa chỉ LinkedIn Server không hợp lệ.';
    }
    return '';
  }, [normalizedServerUrl]);

  const persistSettings = () => {
    const error = validateServerUrl();
    if (error) {
      setNotice({ type: 'error', text: error });
      return;
    }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ serverUrl: normalizedServerUrl, apiKey: cleanApiKey }));
      setServerUrl(normalizedServerUrl);
      setApiKey(cleanApiKey);
      setNotice({ type: 'success', text: 'Đã lưu cấu hình LinkedIn Server trong trình duyệt.' });
    } catch {
      setNotice({ type: 'error', text: 'Không thể lưu cấu hình trong trình duyệt.' });
    }
  };

  const refresh = useCallback(async (silent = false) => {
    const validationError = validateServerUrl();
    if (validationError) {
      setHealth(null);
      if (!silent) setNotice({ type: 'error', text: validationError });
      return;
    }

    if (!silent) setLoading(true);
    try {
      const results = await Promise.allSettled([
        getLinkedInHealth(normalizedServerUrl, cleanApiKey),
        getLinkedInPosts(normalizedServerUrl, cleanApiKey),
      ]);
      const errors = [];

      if (results[0].status === 'fulfilled') setHealth(results[0].value);
      else {
        setHealth(null);
        errors.push(`Kết nối: ${results[0].reason?.message || 'không thành công'}`);
      }

      if (results[1].status === 'fulfilled') setPosts(normalizePosts(results[1].value));
      else errors.push(`Danh sách bài: ${results[1].reason?.message || 'không tải được'}`);

      setLastSyncedAt(new Date());
      if (errors.length) setNotice({ type: 'error', text: errors.join(' · ') });
      else if (!silent) setNotice({ type: 'success', text: 'Đã đồng bộ LinkedIn Server.' });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [normalizedServerUrl, cleanApiKey, validateServerUrl]);

  useEffect(() => {
    refresh(true);
    const interval = setInterval(() => refresh(true), 60_000);
    return () => clearInterval(interval);
  }, [refresh]);

  const addPost = async (sendNow) => {
    const cleanContent = content.trim();
    if (!health) return setNotice({ type: 'error', text: 'Cần kết nối LinkedIn Server trước khi đăng.' });
    if (!cleanContent) return setNotice({ type: 'error', text: 'Nội dung bài viết không được để trống.' });
    if (cleanContent.length > MAX_CONTENT_LENGTH) return setNotice({ type: 'error', text: `Nội dung vượt quá ${MAX_CONTENT_LENGTH} ký tự.` });

    let targetTime = new Date();
    if (!sendNow) {
      targetTime = new Date(scheduledTime);
      if (!scheduledTime || Number.isNaN(targetTime.getTime())) return setNotice({ type: 'error', text: 'Thời gian đăng không hợp lệ.' });
      if (targetTime.getTime() < Date.now() - 60_000) return setNotice({ type: 'error', text: 'Thời gian đăng không được nằm trong quá khứ.' });
    }

    setActionId(sendNow ? 'send' : 'schedule');
    try {
      await createLinkedInPost(normalizedServerUrl, cleanApiKey, {
        content: cleanContent,
        scheduledTime: targetTime.toISOString(),
      });
      setContent('');
      setScheduledTime(toDatetimeLocal());
      await refresh(true);
      setNotice({ type: 'success', text: sendNow ? 'Đã chuyển bài cho server đăng ngay.' : 'Đã thêm bài vào lịch LinkedIn Server.' });
    } catch (error) {
      setNotice({ type: 'error', text: error?.message || 'Không thể tạo bài LinkedIn.' });
    } finally {
      setActionId('');
    }
  };

  const processNow = async () => {
    if (!health) return setNotice({ type: 'error', text: 'LinkedIn Server chưa kết nối.' });
    setActionId('process');
    try {
      const processed = await processLinkedInPosts(normalizedServerUrl, cleanApiKey);
      await refresh(true);
      setNotice({ type: 'success', text: `Đã xử lý ${Array.isArray(processed) ? processed.length : 0} bài đến hạn.` });
    } catch (error) {
      setNotice({ type: 'error', text: error?.message || 'Không thể xử lý hàng đợi LinkedIn.' });
    } finally {
      setActionId('');
    }
  };

  const removePost = async (id) => {
    if (!id) return setNotice({ type: 'error', text: 'Bài viết không có ID hợp lệ.' });
    if (!window.confirm('Xóa bài LinkedIn này khỏi server?')) return;
    setActionId(`delete:${id}`);
    try {
      await deleteLinkedInPost(normalizedServerUrl, cleanApiKey, id);
      setPosts((current) => current.filter((post) => post.id !== id));
      setNotice({ type: 'success', text: 'Đã xóa bài LinkedIn.' });
    } catch (error) {
      setNotice({ type: 'error', text: error?.message || 'Không thể xóa bài LinkedIn.' });
    } finally {
      setActionId('');
    }
  };

  const queued = posts.filter((post) => ['scheduled', 'publishing'].includes(post.status)).length;
  const published = posts.filter((post) => post.status === 'published').length;
  const failed = posts.filter((post) => post.status === 'failed').length;

  return (
    <div className="text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold mb-2 flex items-center gap-3"><BriefcaseBusiness /> LinkedIn</h1>
            <p className="text-gray-300">Soạn, lên lịch và đăng bài qua backend scheduler.</p>
          </div>
          <div className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${health ? 'bg-green-900/30 border-green-700 text-green-200' : 'bg-red-900/30 border-red-700 text-red-200'}`}><Cloud className="w-4 h-4" /> {health ? 'Server online' : 'Chưa kết nối'}</div>
        </div>

        {notice && <div role={notice.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`border rounded-lg p-3 text-sm ${notice.type === 'success' ? 'bg-green-900/30 border-green-700 text-green-200' : 'bg-red-900/30 border-red-700 text-red-200'}`}>{notice.text}</div>}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3" aria-label="Thống kê LinkedIn">
          {[['Tổng bài', posts.length], ['Đang chờ', queued], ['Đã đăng', published], ['Thất bại', failed]].map(([label, value]) => <div key={label} className="bg-gray-800 border border-gray-700 rounded-lg p-4"><p className="text-xs text-gray-400">{label}</p><p className="text-2xl font-bold">{value}</p></div>)}
        </section>

        <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Server className="w-5 h-5" /> Kết nối backend</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <label className="md:col-span-2 space-y-1"><span className="text-xs text-gray-400">Địa chỉ server</span><input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" /></label>
            <label className="space-y-1"><span className="text-xs text-gray-400">API key</span><input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="X-API-Key" className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" /></label>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button type="button" onClick={persistSettings} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg">Lưu cấu hình</button>
            <button type="button" onClick={() => refresh(false)} disabled={loading || Boolean(actionId)} className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-4 py-2 rounded-lg flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Đồng bộ</button>
            <button type="button" onClick={processNow} disabled={Boolean(actionId) || !health} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2 rounded-lg flex items-center gap-2">{actionId === 'process' && <Loader2 className="w-4 h-4 animate-spin" />} Xử lý bài đến hạn</button>
          </div>
          {health && <p className="text-xs text-gray-400 mt-3">Token: {health.tokenConfigured ? 'đã cấu hình' : 'chưa cấu hình'} · Author URN: {health.authorConfigured ? 'đã cấu hình' : 'chưa cấu hình'} · Hàng đợi: {health.queued || 0}</p>}
          {lastSyncedAt && <p className="text-xs text-gray-500 mt-1">Đồng bộ gần nhất: {lastSyncedAt.toLocaleString('vi-VN')}</p>}
        </section>

        <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 md:p-6">
          <h2 className="text-xl font-bold mb-4">Soạn bài chuyên nghiệp</h2>
          <textarea rows="7" maxLength={MAX_CONTENT_LENGTH} value={content} onChange={(event) => setContent(event.target.value)} placeholder="Nội dung LinkedIn, case study, dự án, tuyển dụng..." className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" />
          <p className="text-xs text-gray-400 mt-1 text-right">{content.length}/{MAX_CONTENT_LENGTH}</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <input aria-label="Thời gian đăng LinkedIn" type="datetime-local" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} className="bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <button type="button" onClick={() => addPost(false)} disabled={Boolean(actionId) || !health} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded px-4 py-2 flex justify-center items-center gap-2">{actionId === 'schedule' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />} Lên lịch</button>
            <button type="button" onClick={() => addPost(true)} disabled={Boolean(actionId) || !health} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded px-4 py-2 flex justify-center items-center gap-2">{actionId === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Đăng ngay</button>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">Hàng đợi và lịch sử ({posts.length})</h2>
          <div className="space-y-3">
            {posts.map((post) => (
              <article key={post.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex justify-between gap-4">
                <div className="min-w-0 break-words"><p className="whitespace-pre-wrap text-sm">{post.content || 'Không có nội dung'}</p><p className="text-xs text-gray-400 mt-2">{formatDate(post.scheduledTime || post.createdAt)} · {STATUS_LABELS[post.status] || post.status} · thử {post.attempts} lần</p>{post.result?.postId && <p className="text-xs text-green-400 mt-1">Post ID: {post.result.postId}</p>}{post.lastError && <p className="text-xs text-red-400 mt-1">{post.lastError}</p>}</div>
                <button type="button" onClick={() => removePost(post.id)} disabled={Boolean(actionId)} className="text-red-400 disabled:opacity-40 p-2" aria-label="Xóa bài LinkedIn">{actionId === `delete:${post.id}` ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}</button>
              </article>
            ))}
            {posts.length === 0 && <p className="text-sm text-gray-400">Chưa có bài LinkedIn trên server.</p>}
          </div>
        </section>
      </div>
    </div>
  );
};

export default LinkedInControl;
