import React, { useEffect, useMemo, useState } from 'react';
import {
  BriefcaseBusiness, Clock, Cloud, RefreshCw, Send, Server, Trash2,
} from 'lucide-react';
import {
  createLinkedInPost,
  deleteLinkedInPost,
  getLinkedInHealth,
  getLinkedInPosts,
  processLinkedInPosts,
} from './linkedin_server_api';

const SETTINGS_KEY = 'linkedin_server_settings';

const loadSettings = () => {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
};

const toDatetimeLocal = () => {
  const date = new Date(Date.now() + 5 * 60_000);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const STATUS_LABELS = {
  scheduled: 'Đã lên lịch',
  publishing: 'Đang đăng',
  published: 'Đã đăng',
  failed: 'Thất bại',
};

const LinkedInControl = () => {
  const saved = useMemo(loadSettings, []);
  const [serverUrl, setServerUrl] = useState(saved.serverUrl || 'http://localhost:8790');
  const [apiKey, setApiKey] = useState(saved.apiKey || '');
  const [content, setContent] = useState('');
  const [scheduledTime, setScheduledTime] = useState(toDatetimeLocal());
  const [posts, setPosts] = useState([]);
  const [health, setHealth] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  const persistSettings = () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ serverUrl: serverUrl.trim(), apiKey }));
    setNotice({ type: 'success', text: 'Đã lưu cấu hình LinkedIn server.' });
  };

  const refresh = async (silent = false) => {
    if (!serverUrl.trim()) return;
    if (!silent) setLoading(true);
    try {
      const [nextHealth, nextPosts] = await Promise.all([
        getLinkedInHealth(serverUrl, apiKey),
        getLinkedInPosts(serverUrl, apiKey),
      ]);
      setHealth(nextHealth);
      setPosts(nextPosts);
      if (!silent) setNotice({ type: 'success', text: 'Đã đồng bộ LinkedIn server.' });
    } catch (error) {
      setHealth(null);
      if (!silent) setNotice({ type: 'error', text: error.message });
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    refresh(true);
    const interval = setInterval(() => refresh(true), 60_000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addPost = async (sendNow) => {
    if (!content.trim()) {
      setNotice({ type: 'error', text: 'Nội dung bài viết không được để trống.' });
      return;
    }
    if (!sendNow && !scheduledTime) {
      setNotice({ type: 'error', text: 'Hãy chọn thời gian đăng.' });
      return;
    }

    setLoading(true);
    try {
      await createLinkedInPost(serverUrl, apiKey, {
        content: content.trim(),
        scheduledTime: sendNow ? new Date().toISOString() : new Date(scheduledTime).toISOString(),
      });
      setContent('');
      await refresh(true);
      setNotice({
        type: 'success',
        text: sendNow ? 'Đã chuyển bài cho server đăng ngay.' : 'Đã thêm bài vào lịch LinkedIn server.',
      });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const processNow = async () => {
    setLoading(true);
    try {
      const processed = await processLinkedInPosts(serverUrl, apiKey);
      await refresh(true);
      setNotice({ type: 'success', text: `Đã xử lý ${processed.length} bài đến hạn.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const removePost = async (id) => {
    setLoading(true);
    try {
      await deleteLinkedInPost(serverUrl, apiKey, id);
      await refresh(true);
      setNotice({ type: 'success', text: 'Đã xóa bài LinkedIn.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const queued = posts.filter((post) => post.status === 'scheduled').length;
  const published = posts.filter((post) => post.status === 'published').length;
  const failed = posts.filter((post) => post.status === 'failed').length;

  return (
    <div className="text-white p-4 md:p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3"><BriefcaseBusiness /> LinkedIn</h1>
            <p className="text-gray-300">Soạn, lên lịch và đăng bài qua backend scheduler an toàn hơn.</p>
          </div>
          <div className={`px-3 py-2 rounded-lg border text-sm flex items-center gap-2 ${health ? 'bg-green-900/30 border-green-700 text-green-200' : 'bg-red-900/30 border-red-700 text-red-200'}`}>
            <Cloud className="w-4 h-4" /> {health ? 'Server online' : 'Chưa kết nối'}
          </div>
        </div>

        {notice && <div className={`border rounded-lg p-3 text-sm ${notice.type === 'success' ? 'bg-green-900/30 border-green-700' : 'bg-red-900/30 border-red-700'}`}>{notice.text}</div>}

        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4"><p className="text-xs text-gray-400">Tổng bài</p><p className="text-2xl font-bold">{posts.length}</p></div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4"><p className="text-xs text-gray-400">Đang chờ</p><p className="text-2xl font-bold">{queued}</p></div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4"><p className="text-xs text-gray-400">Đã đăng</p><p className="text-2xl font-bold">{published}</p></div>
          <div className="bg-gray-800 border border-gray-700 rounded-lg p-4"><p className="text-xs text-gray-400">Thất bại</p><p className="text-2xl font-bold">{failed}</p></div>
        </section>

        <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Server className="w-5 h-5" /> Kết nối backend</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} placeholder="http://localhost:8790" className="md:col-span-2 bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="X-API-Key" className="bg-gray-700 border border-gray-600 rounded px-3 py-2" />
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={persistSettings} className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg">Lưu cấu hình</button>
            <button onClick={() => refresh(false)} disabled={loading} className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-4 py-2 rounded-lg flex items-center gap-2"><RefreshCw className="w-4 h-4" /> Đồng bộ</button>
            <button onClick={processNow} disabled={loading} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 px-4 py-2 rounded-lg">Xử lý bài đến hạn</button>
          </div>
          {health && (
            <p className="text-xs text-gray-400 mt-3">
              Token: {health.tokenConfigured ? 'đã cấu hình' : 'chưa cấu hình'} · Author URN: {health.authorConfigured ? 'đã cấu hình' : 'chưa cấu hình'} · Hàng đợi: {health.queued}
            </p>
          )}
        </section>

        <section className="bg-gray-800 border border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Soạn bài chuyên nghiệp</h2>
          <textarea rows="7" maxLength="3000" value={content} onChange={(event) => setContent(event.target.value)} placeholder="Nội dung LinkedIn, case study, dự án, tuyển dụng..." className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" />
          <p className="text-xs text-gray-400 mt-1 text-right">{content.length}/3000</p>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-4">
            <input type="datetime-local" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} className="bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <button onClick={() => addPost(false)} disabled={loading} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded px-4 py-2 flex justify-center items-center gap-2"><Clock className="w-4 h-4" /> Lên lịch</button>
            <button onClick={() => addPost(true)} disabled={loading} className="bg-green-600 hover:bg-green-700 disabled:opacity-50 rounded px-4 py-2 flex justify-center items-center gap-2"><Send className="w-4 h-4" /> Đăng ngay</button>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">Hàng đợi và lịch sử ({posts.length})</h2>
          <div className="space-y-3">
            {posts.map((post) => (
              <div key={post.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex justify-between gap-4">
                <div className="min-w-0">
                  <p className="whitespace-pre-wrap text-sm">{post.content}</p>
                  <p className="text-xs text-gray-400 mt-2">
                    {new Date(post.scheduledTime).toLocaleString('vi-VN')} · {STATUS_LABELS[post.status] || post.status} · thử {post.attempts || 0} lần
                  </p>
                  {post.result?.postId && <p className="text-xs text-green-400 mt-1">Post ID: {post.result.postId}</p>}
                  {post.lastError && <p className="text-xs text-red-400 mt-1">{post.lastError}</p>}
                </div>
                <button onClick={() => removePost(post.id)} disabled={loading} className="text-red-400 disabled:opacity-40" title="Xóa"><Trash2 className="w-5 h-5" /></button>
              </div>
            ))}
            {posts.length === 0 && <p className="text-sm text-gray-400">Chưa có bài LinkedIn trên server.</p>}
          </div>
        </section>
      </div>
    </div>
  );
};

export default LinkedInControl;
