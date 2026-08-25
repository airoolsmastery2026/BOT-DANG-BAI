import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Loader2, RefreshCw, Send, Server, Trash2 } from 'lucide-react';
import { ZaloServerAPI } from './zalo_server_api';

const SETTINGS_KEY = 'zalo_server_settings';
const DEFAULT_SETTINGS = { baseUrl: 'http://localhost:8787', apiKey: '' };
const MAX_CONTENT_LENGTH = 2000;

const loadSettings = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    return {
      baseUrl: typeof parsed.baseUrl === 'string' ? parsed.baseUrl : DEFAULT_SETTINGS.baseUrl,
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

const normalizeMessages = (value) => {
  const items = Array.isArray(value?.messages) ? value.messages : [];
  return items.map((item, index) => ({
    ...item,
    id: item?.id || `zalo-${index}-${item?.createdAt || Date.now()}`,
    userId: String(item?.userId || ''),
    content: String(item?.content || ''),
    status: String(item?.status || 'scheduled').toLowerCase(),
    attempts: Number.isFinite(Number(item?.attempts)) ? Number(item.attempts) : 0,
  }));
};

const ZaloControl = () => {
  const savedSettings = useMemo(loadSettings, []);
  const [baseUrl, setBaseUrl] = useState(savedSettings.baseUrl);
  const [apiKey, setApiKey] = useState(savedSettings.apiKey);
  const [userId, setUserId] = useState('');
  const [content, setContent] = useState('');
  const [scheduledTime, setScheduledTime] = useState(toDatetimeLocal());
  const [messages, setMessages] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState('');
  const [notice, setNotice] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const normalizedBaseUrl = baseUrl.trim().replace(/\/$/, '');
  const api = useMemo(() => new ZaloServerAPI(normalizedBaseUrl, apiKey.trim()), [normalizedBaseUrl, apiKey]);

  const validateServerUrl = useCallback(() => {
    if (!normalizedBaseUrl) return 'Cần nhập địa chỉ Zalo Server.';
    try {
      const url = new URL(normalizedBaseUrl);
      if (!['http:', 'https:'].includes(url.protocol)) return 'Địa chỉ server phải dùng HTTP hoặc HTTPS.';
    } catch {
      return 'Địa chỉ Zalo Server không hợp lệ.';
    }
    return '';
  }, [normalizedBaseUrl]);

  const saveSettings = () => {
    const error = validateServerUrl();
    if (error) {
      setNotice({ type: 'error', text: error });
      return;
    }
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify({ baseUrl: normalizedBaseUrl, apiKey: apiKey.trim() }));
      setBaseUrl(normalizedBaseUrl);
      setNotice({ type: 'success', text: 'Đã lưu cấu hình Zalo Server trong trình duyệt.' });
    } catch {
      setNotice({ type: 'error', text: 'Không thể lưu cấu hình trong trình duyệt.' });
    }
  };

  const refresh = useCallback(async (showSuccess = false) => {
    const validationError = validateServerUrl();
    if (validationError) {
      setHealth(null);
      if (showSuccess) setNotice({ type: 'error', text: validationError });
      return;
    }

    setLoading(true);
    try {
      const results = await Promise.allSettled([api.health(), api.listMessages()]);
      const errors = [];

      if (results[0].status === 'fulfilled') setHealth(results[0].value);
      else {
        setHealth(null);
        errors.push(`Kết nối: ${results[0].reason?.message || 'không thành công'}`);
      }

      if (results[1].status === 'fulfilled') setMessages(normalizeMessages(results[1].value));
      else errors.push(`Hàng đợi: ${results[1].reason?.message || 'không tải được'}`);

      setLastSyncedAt(new Date());
      if (errors.length) setNotice({ type: 'error', text: errors.join(' · ') });
      else if (showSuccess) setNotice({ type: 'success', text: 'Đã đồng bộ dữ liệu từ Zalo Server.' });
    } finally {
      setLoading(false);
    }
  }, [api, validateServerUrl]);

  useEffect(() => {
    refresh(false);
  }, [refresh]);

  const submitMessage = async (sendNow) => {
    const cleanUserId = userId.trim();
    const cleanContent = content.trim();
    if (!health) return setNotice({ type: 'error', text: 'Cần kết nối Zalo Server trước khi gửi.' });
    if (!cleanUserId) return setNotice({ type: 'error', text: 'Cần nhập Zalo user_id người nhận.' });
    if (!cleanContent) return setNotice({ type: 'error', text: 'Nội dung tin nhắn không được để trống.' });
    if (cleanContent.length > MAX_CONTENT_LENGTH) return setNotice({ type: 'error', text: `Nội dung vượt quá ${MAX_CONTENT_LENGTH} ký tự.` });

    let targetTime = new Date();
    if (!sendNow) {
      targetTime = new Date(scheduledTime);
      if (!scheduledTime || Number.isNaN(targetTime.getTime())) return setNotice({ type: 'error', text: 'Thời gian gửi không hợp lệ.' });
      if (targetTime.getTime() < Date.now() - 60_000) return setNotice({ type: 'error', text: 'Thời gian gửi không được nằm trong quá khứ.' });
    }

    setActionId(sendNow ? 'send' : 'schedule');
    try {
      await api.createMessage({ userId: cleanUserId, content: cleanContent, scheduledTime: targetTime.toISOString() });
      setContent('');
      setScheduledTime(toDatetimeLocal());
      setNotice({ type: 'success', text: sendNow ? 'Đã gửi yêu cầu gửi ngay.' : 'Đã thêm tin nhắn vào hàng đợi server.' });
      await refresh(false);
    } catch (error) {
      setNotice({ type: 'error', text: error?.message || 'Không thể tạo tin nhắn.' });
    } finally {
      setActionId('');
    }
  };

  const processQueue = async () => {
    if (!health) return setNotice({ type: 'error', text: 'Zalo Server chưa kết nối.' });
    setActionId('process');
    try {
      const result = await api.processQueue();
      setNotice({ type: 'success', text: `Đã xử lý ${Array.isArray(result?.processed) ? result.processed.length : 0} tin nhắn đến hạn.` });
      await refresh(false);
    } catch (error) {
      setNotice({ type: 'error', text: error?.message || 'Không thể xử lý hàng đợi.' });
    } finally {
      setActionId('');
    }
  };

  const removeMessage = async (id) => {
    if (!id) return setNotice({ type: 'error', text: 'Tác vụ không có ID hợp lệ.' });
    if (!window.confirm('Xóa tin nhắn này khỏi server?')) return;
    setActionId(`delete:${id}`);
    try {
      await api.deleteMessage(id);
      setMessages((current) => current.filter((message) => message.id !== id));
      setNotice({ type: 'success', text: 'Đã xóa tin nhắn.' });
    } catch (error) {
      setNotice({ type: 'error', text: error?.message || 'Không thể xóa tin nhắn.' });
    } finally {
      setActionId('');
    }
  };

  const upcoming = messages.filter((message) => ['scheduled', 'sending'].includes(message.status)).sort((a, b) => new Date(a.scheduledTime || 0) - new Date(b.scheduledTime || 0));
  const history = messages.filter((message) => !['scheduled', 'sending'].includes(message.status)).sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  return (
    <div className="text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold mb-2">💬 Điều khiển Zalo OA</h1>
          <p className="text-gray-300">Kết nối tới scheduler phía server; OA Access Token không đặt trong frontend.</p>
        </div>

        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 text-sm text-yellow-100 flex gap-3"><AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" /><p>Đây là Zalo Official Account OpenAPI, không phải đăng bài lên nhật ký cá nhân.</p></div>

        {notice && <div role={notice.type === 'error' ? 'alert' : 'status'} aria-live="polite" className={`rounded-lg p-3 text-sm border ${notice.type === 'success' ? 'bg-green-900/30 border-green-700 text-green-200' : 'bg-red-900/30 border-red-700 text-red-200'}`}>{notice.text}</div>}

        <section className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-lg p-4 md:p-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2"><Server className="w-5 h-5" /> Kết nối Zalo Server</h2>
            <span className={`text-xs px-3 py-1 rounded-full ${health ? 'bg-green-700' : 'bg-gray-700'}`}>{health ? `Online · ${health.queued || 0} đang chờ` : 'Chưa kết nối'}</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-1"><span className="text-xs text-gray-400">Địa chỉ server</span><input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" /></label>
            <label className="space-y-1"><span className="text-xs text-gray-400">API key</span><input type="password" autoComplete="off" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="ZALO_SERVER_API_KEY" className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" /></label>
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button type="button" onClick={saveSettings} className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg font-medium">Lưu cấu hình</button>
            <button type="button" onClick={() => refresh(true)} disabled={loading || Boolean(actionId)} className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-4 py-2 rounded-lg font-medium flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Kiểm tra kết nối</button>
          </div>
          {lastSyncedAt && <p className="text-xs text-gray-500 mt-3">Đồng bộ gần nhất: {lastSyncedAt.toLocaleString('vi-VN')}</p>}
        </section>

        <section className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-lg p-4 md:p-6">
          <h2 className="text-xl font-bold mb-4">Soạn tin nhắn</h2>
          <input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="Zalo user_id người nhận" className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 mb-4" />
          <textarea maxLength={MAX_CONTENT_LENGTH} value={content} onChange={(event) => setContent(event.target.value)} rows="6" placeholder="Nhập nội dung gửi qua Zalo OA..." className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" />
          <p className="text-xs text-gray-400 mt-1 text-right">{content.length}/{MAX_CONTENT_LENGTH}</p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <label className="space-y-1"><span className="block text-xs text-gray-400">Thời gian gửi</span><input type="datetime-local" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" /></label>
            <div className="flex items-end gap-2">
              <button type="button" onClick={() => submitMessage(false)} disabled={Boolean(actionId) || !health} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-4 py-2 rounded-lg flex items-center justify-center gap-2">{actionId === 'schedule' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Clock className="w-4 h-4" />} Lên lịch</button>
              <button type="button" onClick={() => submitMessage(true)} disabled={Boolean(actionId) || !health} className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 px-4 py-2 rounded-lg flex items-center justify-center gap-2">{actionId === 'send' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Gửi ngay</button>
            </div>
          </div>
        </section>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"><div><p className="font-medium">Scheduler chạy phía server</p><p className="text-xs text-gray-400">Server tự kiểm tra định kỳ, kể cả khi đóng trình duyệt.</p></div><button type="button" onClick={processQueue} disabled={Boolean(actionId) || !health} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 px-4 py-2 rounded-lg flex items-center justify-center gap-2">{actionId === 'process' && <Loader2 className="w-4 h-4 animate-spin" />} Xử lý hàng đợi ngay</button></div>

        {[['Hàng đợi', upcoming], ['Lịch sử', history]].map(([title, items]) => (
          <section key={title}>
            <h2 className="text-xl font-bold mb-3">{title} ({items.length})</h2>
            <div className="space-y-3">
              {items.length === 0 && <p className="text-gray-400 text-sm">Chưa có dữ liệu.</p>}
              {items.map((message) => (
                <article key={message.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex justify-between gap-4">
                  <div className="min-w-0 break-words"><div className="flex items-center gap-2 mb-2">{message.status === 'sent' ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : title === 'Lịch sử' ? <AlertTriangle className="w-4 h-4 text-red-400" /> : null}<span className="text-sm font-medium">{message.status}</span></div><p className="whitespace-pre-wrap text-sm">{message.content || 'Không có nội dung'}</p><p className="text-xs text-gray-400 mt-2">user_id: {message.userId || 'không rõ'} · {formatDate(message.scheduledTime || message.createdAt)} · lần thử {message.attempts}/3</p>{message.lastError && <p className="text-xs text-red-400 mt-2">{message.lastError}</p>}</div>
                  <button type="button" onClick={() => removeMessage(message.id)} disabled={Boolean(actionId)} className="text-red-400 hover:text-red-300 disabled:opacity-40 p-2" aria-label="Xóa tin nhắn">{actionId === `delete:${message.id}` ? <Loader2 className="w-5 h-5 animate-spin" /> : <Trash2 className="w-5 h-5" />}</button>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default ZaloControl;
