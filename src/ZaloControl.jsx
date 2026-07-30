import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, Send, Trash2 } from 'lucide-react';
import { ZaloOAAPI } from './zalo_api';

const STORAGE_KEY = 'zalo_oa_scheduled_messages';
const SETTINGS_KEY = 'zalo_oa_settings';

const loadJson = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch (error) {
    console.error(`Không thể đọc ${key}:`, error);
    return fallback;
  }
};

const saveJson = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const toDatetimeLocal = () => {
  const date = new Date(Date.now() + 5 * 60 * 1000);
  const pad = (value) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

const ZaloControl = () => {
  const savedSettings = useMemo(() => loadJson(SETTINGS_KEY, { accessToken: '', userId: '' }), []);
  const [accessToken, setAccessToken] = useState(savedSettings.accessToken || '');
  const [userId, setUserId] = useState(savedSettings.userId || '');
  const [content, setContent] = useState('');
  const [scheduledTime, setScheduledTime] = useState(toDatetimeLocal());
  const [messages, setMessages] = useState(() => loadJson(STORAGE_KEY, []));
  const [autoSend, setAutoSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState(null);

  const persistMessages = (next) => {
    setMessages(next);
    saveJson(STORAGE_KEY, next);
  };

  const saveSettings = () => {
    saveJson(SETTINGS_KEY, { accessToken: accessToken.trim(), userId: userId.trim() });
    setNotice({ type: 'success', text: 'Đã lưu cấu hình Zalo OA trong trình duyệt hiện tại.' });
  };

  const sendMessage = async (message) => {
    const api = new ZaloOAAPI(accessToken);
    return api.sendTextMessage(message.userId, message.content);
  };

  const processDueMessages = async () => {
    if (!accessToken.trim()) return;

    const now = Date.now();
    const due = messages.filter(
      (message) => message.status === 'scheduled' && new Date(message.scheduledTime).getTime() <= now
    );

    if (due.length === 0) return;

    setSending(true);
    const resultById = {};

    for (const message of due) {
      resultById[message.id] = await sendMessage(message);
    }

    const next = messages.map((message) => {
      const result = resultById[message.id];
      if (!result) return message;

      return {
        ...message,
        status: result.success ? 'sent' : 'failed',
        sentAt: new Date().toISOString(),
        result,
      };
    });

    persistMessages(next);
    setSending(false);
  };

  useEffect(() => {
    if (!autoSend) return undefined;
    const interval = setInterval(processDueMessages, 60000);
    processDueMessages();
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoSend, accessToken, messages]);

  const addToQueue = async (sendNow) => {
    if (!accessToken.trim() || !userId.trim() || !content.trim()) {
      setNotice({ type: 'error', text: 'Cần nhập Access Token, user_id và nội dung.' });
      return;
    }

    const message = {
      id: `zalo_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      userId: userId.trim(),
      content: content.trim(),
      scheduledTime: sendNow ? new Date().toISOString() : new Date(scheduledTime).toISOString(),
      status: 'scheduled',
      createdAt: new Date().toISOString(),
    };

    const next = [...messages, message];
    persistMessages(next);
    setContent('');

    if (sendNow) {
      setSending(true);
      const result = await sendMessage(message);
      const completed = next.map((item) => item.id === message.id ? {
        ...item,
        status: result.success ? 'sent' : 'failed',
        sentAt: new Date().toISOString(),
        result,
      } : item);
      persistMessages(completed);
      setSending(false);
      setNotice({
        type: result.success ? 'success' : 'error',
        text: result.success ? 'Đã gửi tin nhắn Zalo OA.' : `Gửi thất bại: ${result.error}`,
      });
    } else {
      setNotice({ type: 'success', text: 'Đã thêm tin nhắn vào lịch gửi.' });
    }
  };

  const removeMessage = (id) => {
    persistMessages(messages.filter((message) => message.id !== id));
  };

  const upcoming = messages
    .filter((message) => message.status === 'scheduled')
    .sort((a, b) => new Date(a.scheduledTime) - new Date(b.scheduledTime));

  const history = messages
    .filter((message) => message.status !== 'scheduled')
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return (
    <div className="text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2">💬 Điều khiển Zalo OA</h1>
          <p className="text-gray-300">
            Gửi và lên lịch tin nhắn văn bản tới người dùng đã tương tác hoặc cấp quyền cho Official Account.
          </p>
        </div>

        <div className="bg-yellow-900/30 border border-yellow-700 rounded-lg p-4 text-sm text-yellow-100 flex gap-3">
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <p>
            Đây là tích hợp Zalo Official Account, không phải đăng bài lên nhật ký cá nhân. Bản hiện tại chạy trong
            trình duyệt; lịch gửi chỉ hoạt động khi tab đang mở. Token production nên chuyển sang backend và mã hóa.
          </p>
        </div>

        {notice && (
          <div className={`rounded-lg p-3 text-sm border ${notice.type === 'success' ? 'bg-green-900/30 border-green-700 text-green-200' : 'bg-red-900/30 border-red-700 text-red-200'}`}>
            {notice.text}
          </div>
        )}

        <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Cấu hình kết nối</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <input
              type="password"
              value={accessToken}
              onChange={(event) => setAccessToken(event.target.value)}
              placeholder="Zalo OA Access Token"
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2"
            />
            <input
              value={userId}
              onChange={(event) => setUserId(event.target.value)}
              placeholder="Zalo user_id người nhận"
              className="bg-gray-700 border border-gray-600 rounded px-3 py-2"
            />
          </div>
          <button onClick={saveSettings} className="mt-4 bg-purple-600 hover:bg-purple-700 px-4 py-2 rounded-lg font-medium">
            Lưu cấu hình
          </button>
        </div>

        <div className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4">Soạn tin nhắn</h2>
          <textarea
            value={content}
            onChange={(event) => setContent(event.target.value)}
            rows="6"
            placeholder="Nhập nội dung gửi qua Zalo OA..."
            className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2 mb-4"
          />
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="block text-xs text-gray-400 mb-1">Thời gian gửi</label>
              <input
                type="datetime-local"
                value={scheduledTime}
                onChange={(event) => setScheduledTime(event.target.value)}
                className="w-full bg-gray-700 border border-gray-600 rounded px-3 py-2"
              />
            </div>
            <div className="flex items-end gap-2">
              <button
                onClick={() => addToQueue(false)}
                disabled={sending}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 px-4 py-2 rounded-lg flex items-center justify-center gap-2"
              >
                <Clock className="w-4 h-4" /> Lên lịch
              </button>
              <button
                onClick={() => addToQueue(true)}
                disabled={sending}
                className="flex-1 bg-green-600 hover:bg-green-700 disabled:opacity-50 px-4 py-2 rounded-lg flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" /> Gửi ngay
              </button>
            </div>
          </div>
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-medium">Tự động gửi tin đến hạn</p>
            <p className="text-xs text-gray-400">Kiểm tra mỗi 60 giây khi tab Zalo đang mở.</p>
          </div>
          <button
            onClick={() => setAutoSend((value) => !value)}
            className={`px-4 py-2 rounded-lg font-medium ${autoSend ? 'bg-green-600' : 'bg-gray-600'}`}
          >
            {autoSend ? 'Đang bật' : 'Đang tắt'}
          </button>
        </div>

        <section>
          <h2 className="text-xl font-bold mb-3">Hàng đợi ({upcoming.length})</h2>
          <div className="space-y-3">
            {upcoming.length === 0 && <p className="text-gray-400 text-sm">Chưa có tin nhắn chờ gửi.</p>}
            {upcoming.map((message) => (
              <div key={message.id} className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex justify-between gap-4">
                <div>
                  <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                  <p className="text-xs text-gray-400 mt-2">user_id: {message.userId} · {new Date(message.scheduledTime).toLocaleString('vi-VN')}</p>
                </div>
                <button onClick={() => removeMessage(message.id)} className="text-red-400 hover:text-red-300" title="Xóa">
                  <Trash2 className="w-5 h-5" />
                </button>
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
                  <div className="flex items-center gap-2 mb-2">
                    {message.status === 'sent' ? (
                      <CheckCircle2 className="w-4 h-4 text-green-400" />
                    ) : (
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    )}
                    <span className="text-sm font-medium">{message.status === 'sent' ? 'Đã gửi' : 'Thất bại'}</span>
                  </div>
                  <p className="whitespace-pre-wrap text-sm">{message.content}</p>
                  {message.result?.error && <p className="text-xs text-red-400 mt-2">{message.result.error}</p>}
                </div>
                <button onClick={() => removeMessage(message.id)} className="text-red-400 hover:text-red-300" title="Xóa">
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default ZaloControl;
