import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, RefreshCw, Send, Server, Trash2 } from 'lucide-react';
import { ZaloServerAPI } from './zalo_server_api';

const SETTINGS_KEY = 'zalo_server_settings';

const loadSettings = () => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? JSON.parse(raw) : { baseUrl: 'http://localhost:8787', apiKey: '' };
  } catch {
    return { baseUrl: 'http://localhost:8787', apiKey: '' };
  }
};

const toDatetimeLocal = () => {
  const date = new Date(Date.now() + 5 * 60 * 1000);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const ZaloControl = () => {
  const savedSettings = useMemo(loadSettings, []);
  const [baseUrl, setBaseUrl] = useState(savedSettings.baseUrl || 'http://localhost:8787');
  const [apiKey, setApiKey] = useState(savedSettings.apiKey || '');
  const [userId, setUserId] = useState('');
  const [content, setContent] = useState('');
  const [scheduledTime, setScheduledTime] = useState(toDatetimeLocal());
  const [messages, setMessages] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);

  const api = useMemo(() => new ZaloServerAPI(baseUrl, apiKey), [baseUrl, apiKey]);

  const saveSettings = () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim() }));
    setNotice({ type: 'success', text: 'Đã lưu địa chỉ server và API key trong trình duyệt.' });
  };

  const refresh = async (showSuccess = false) => {
    setLoading(true);
    try {
      const [healthData, messageData] = await Promise.all([api.health(), api.listMessages()]);
      setHealth(healthData);
      setMessages(messageData.messages || []);
      if (showSuccess) setNotice({ type: 'success', text: 'Đã đồng bộ dữ liệu từ Zalo Server.' });
    } catch (error) {
      setHealth(null);
      setNotice({ type: 'error', text: `Không thể kết nối server: ${error.message}` });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh(false);
    // Chỉ tự kết nối lại khi cấu hình server thay đổi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api]);

  const submitMessage = async (sendNow) => {
    if (!userId.trim() || !content.trim()) {
      setNotice({ type: 'error', text: 'Cần nhập Zalo user_id và nội dung.' });
      return;
    }

    setLoading(true);
    try {
      await api.createMessage({
        userId: userId.trim(),
        content: content.trim(),
        scheduledTime: sendNow ? new Date().toISOString() : new Date(scheduledTime).toISOString(),
      });
      setContent('');
      setNotice({ type: 'success', text: sendNow ? 'Đã gửi yêu cầu gửi ngay.' : 'Đã thêm tin nhắn vào hàng đợi server.' });
      await refresh(false);
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
      setLoading(false);
    }
  };

  const processQueue = async () => {
    setLoading(true);
    try {
      const result = await api.processQueue();
      setNotice({ type: 'success', text: `Đã xử lý ${result.processed?.length || 0} tin nhắn đến hạn.` });
      await refresh(false);
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
      setLoading(false);
    }
  };

  const removeMessage = async (id) => {
    setLoading(true);
    try {
      await api.deleteMessage(id);
      setMessages((current) => current.filter((message) => message.id !== id));
      setNotice({ type: 'success', text: 'Đã xóa tin nhắn.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  };

  const upcoming = messages
    .filter((message) => ['scheduled', 'sending'].includes(message.status))
    .sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));

  const history = messages
    .filter((message) => !['scheduled', 'sending'].includes(message.status))
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div className="text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2">💬 Điều khiển Zalo OA</h1>
          <p className="text-gray-300">Giao diện kết nối tới scheduler phía server; OA Access Token không còn đặt trong frontend.</p>
        </div>

        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 text-sm text-yellow-100 flex gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <p>Đây là Zalo Official Account OpenAPI, không phải đăng bài lên nhật ký cá nhân. Chỉ gửi tới người dùng hợp lệ theo quyền và chính sách của OA.</p>
        </div>

        {notice && (
          <div className={`rounded-lg p-3 text-sm border ${notice.type === 'success' ? 'bg-green-900/30 border-green-700 text-green-200' : 'bg-red-900/30 border-red-700 text-red-200'}`}>
            {notice.text}
          </div>
        )}

        <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-lg p-6">
          <div className="flex items-center justify-between gap-4 mb-4">
            <h2 className="text-xl font-bold flex items-center gap-2"><Server className="w-5 h-5" /> Kết nối Zalo Server</h2>
            <span className={`text-xs px-3 py-1 rounded-full ${health ? 'bg-green-700' : 'bg-gray-700'}`}>
              {health ? `Online · ${health.queued || 0} đang chờ` : 'Chưa kết nối'}
            </span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder="http://localhost:8787" className="bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <input type="password" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="ZALO_SERVER_API_KEY" className="bg-gray-700 border border-gray-600 rounded px-3 py-2" />
          </div>
          <div className="flex flex-wrap gap-2 mt-4">
            <button onClick={saveSettings} className="bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg font-medium">Lưu cấu hình</button>
            <button onClick={() => refresh(true)} disabled={loading} className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-4 py-2 rounded-lg font-medium flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Kiểm tra kết nối
            </button>
          </div>
        </div>

        <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Soạn tin nhắn</h2>
          <input value={userId} onChange={(event) => setUserId(event.target.value)} placeholder="Zalo user_id người nhận" className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 mb-4" />
          <textarea value={content} onChange={(event) => setContent(event.target.value)} rows="6" placeholder="Nhập nội dung gửi qua Zalo OA..." className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 mb-4" />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Thời gian gửi</label>
              <input type="datetime-local" value={scheduledTime} onChange={(event) => setScheduledTime(event.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            </div>
            <div className="flex items-end gap-2">
              <button onClick={() => submitMessage(false)} disabled={loading || !health} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 px-4 py-2 rounded-lg flex items-center justify-center gap-2"><Clock className="w-4 h-4" /> Lên lịch</button>
              <button onClick={() => submitMessage(true)} disabled={loading || !health} className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-40 px-4 py-2 rounded-lg flex items-center justify-center gap-2"><Send className="w-4 h-4" /> Gửi ngay</button>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center justify-between gap-4">
          <div><p className="font-medium">Scheduler chạy phía server</p><p className="text-xs text-gray-400">Server tự kiểm tra mỗi 60 giây, kể cả khi đóng trình duyệt.</p></div>
          <button onClick={processQueue} disabled={loading || !health} className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 px-4 py-2 rounded-lg">Xử lý hàng đợi ngay</button>
        </div>

        <section>
          <h2 className="text-xl font-bold mb-3">Hàng đợi ({upcoming.length})</h2>
          <div className="space-y-3">
            {upcoming.length === 0 && <p className="text-gray-400 text-sm">Chưa có tin nhắn chờ gửi.</p>}
            {upcoming.map((message) => (
              <div key={message.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex justify-between gap-4">
                <div><p className="whitespace-pre-wrap text-sm">{message.content}</p><p className="text-xs text-gray-400 mt-2">user_id: {message.userId} · {new Date(message.scheduledTime).toLocaleString('vi-VN')} · lần thử {message.attempts || 0}/3</p></div>
                <button onClick={() => removeMessage(message.id)} disabled={loading} className="text-red-400 hover:text-red-300" title="Xóa"><Trash2 className="w-5 h-5" /></button>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold mb-3">Lịch sử</h2>
          <div className="space-y-3">
            {history.length === 0 && <p className="text-gray-400 text-sm">Chưa có lịch sử gửi.</p>}
            {history.map((message) => (
              <div key={message.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-2">{message.status === 'sent' ? <CheckCircle2 className="w-4 h-4 text-green-400" /> : <AlertTriangle className="w-4 h-4 text-red-400" />}<span className="text-sm font-medium">{message.status === 'sent' ? 'Đã gửi' : 'Thất bại'}</span></div>
                  <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                  {message.lastError && <p className="text-xs text-red-400 mt-2">{message.lastError}</p>}
                </div>
                <button onClick={() => removeMessage(message.id)} disabled={loading} className="text-red-400 hover:text-red-300" title="Xóa"><Trash2 className="w-5 h-5" /></button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ZaloControl;
