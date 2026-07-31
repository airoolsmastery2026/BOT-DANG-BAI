import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  Bell,
  Check,
  CheckCircle2,
  Clock3,
  Info,
  Trash2,
} from 'lucide-react';

const STORAGE_KEY = 'app_notifications';
const VALID_TYPES = new Set(['info', 'success', 'warning', 'error']);

const createSeedNotifications = () => ([
  {
    id: 'welcome',
    type: 'info',
    title: 'Trung tâm thông báo đã sẵn sàng',
    message: 'Theo dõi trạng thái hệ thống, hàng đợi và các sự kiện vận hành tại đây.',
    source: 'system',
    createdAt: new Date().toISOString(),
    read: false,
  },
]);

const normalizeNotification = (item, index) => {
  if (!item || typeof item !== 'object') return null;

  const createdAt = new Date(item.createdAt);
  return {
    id: String(item.id || `notification_${Date.now()}_${index}`),
    type: VALID_TYPES.has(item.type) ? item.type : 'info',
    title: String(item.title || 'Thông báo hệ thống').trim(),
    message: String(item.message || '').trim(),
    source: String(item.source || 'system').trim(),
    createdAt: Number.isNaN(createdAt.getTime()) ? new Date().toISOString() : createdAt.toISOString(),
    read: Boolean(item.read),
  };
};

const readNotifications = () => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedNotifications();

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return createSeedNotifications();

    return parsed
      .map(normalizeNotification)
      .filter(Boolean)
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  } catch {
    return createSeedNotifications();
  }
};

const persistNotifications = (items) => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error?.name === 'QuotaExceededError'
        ? 'Bộ nhớ trình duyệt đã đầy. Hãy xóa bớt dữ liệu cũ rồi thử lại.'
        : 'Không thể lưu thay đổi thông báo trên trình duyệt.',
    };
  }
};

const typeConfig = {
  success: {
    label: 'Thành công',
    icon: CheckCircle2,
    className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200',
  },
  warning: {
    label: 'Cảnh báo',
    icon: AlertTriangle,
    className: 'border-amber-500/30 bg-amber-500/10 text-amber-200',
  },
  error: {
    label: 'Lỗi',
    icon: AlertTriangle,
    className: 'border-red-500/30 bg-red-500/10 text-red-200',
  },
  info: {
    label: 'Thông tin',
    icon: Info,
    className: 'border-sky-500/30 bg-sky-500/10 text-sky-200',
  },
};

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Không rõ thời gian';
  return date.toLocaleString('vi-VN');
};

const NotificationCenter = () => {
  const [notifications, setNotifications] = useState(readNotifications);
  const [filter, setFilter] = useState('all');
  const [notice, setNotice] = useState(null);

  const updateNotifications = (updater, successMessage = '') => {
    setNotifications((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      const normalized = next
        .map(normalizeNotification)
        .filter(Boolean)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      const result = persistNotifications(normalized);

      if (!result.success) {
        setNotice({ type: 'error', text: result.error });
        return current;
      }

      setNotice(successMessage ? { type: 'success', text: successMessage } : null);
      return normalized;
    });
  };

  const unreadCount = notifications.filter((item) => !item.read).length;
  const filtered = useMemo(
    () => notifications.filter((item) => filter === 'all' || item.type === filter),
    [notifications, filter],
  );

  const markRead = (id) => {
    updateNotifications(
      (items) => items.map((item) => (item.id === id ? { ...item, read: true } : item)),
      'Đã đánh dấu thông báo là đã đọc.',
    );
  };

  const markAllRead = () => {
    updateNotifications(
      (items) => items.map((item) => ({ ...item, read: true })),
      'Đã đánh dấu tất cả thông báo là đã đọc.',
    );
  };

  const removeNotification = (id) => {
    updateNotifications(
      (items) => items.filter((item) => item.id !== id),
      'Đã xóa thông báo.',
    );
  };

  const clearAll = () => {
    if (!window.confirm('Xóa toàn bộ thông báo? Thao tác này không thể hoàn tác.')) return;
    updateNotifications([], 'Đã xóa toàn bộ thông báo.');
  };

  return (
    <div className="text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3">
              <Bell aria-hidden="true" /> Trung tâm thông báo
            </h1>
            <p className="text-gray-300 mt-2">Tập trung cảnh báo, lỗi và trạng thái vận hành của toàn bộ ứng dụng.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-4 py-2 flex items-center gap-2"
            >
              <Check className="w-4 h-4" aria-hidden="true" /> Đánh dấu đã đọc
            </button>
            <button
              type="button"
              onClick={clearAll}
              disabled={notifications.length === 0}
              className="bg-red-600/80 hover:bg-red-600 disabled:opacity-40 disabled:cursor-not-allowed rounded-lg px-4 py-2 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" aria-hidden="true" /> Xóa tất cả
            </button>
          </div>
        </div>

        {notice && (
          <div
            role="status"
            aria-live="polite"
            className={`border rounded-lg p-3 ${notice.type === 'error'
              ? 'border-red-500/40 bg-red-500/10 text-red-200'
              : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}
          >
            {notice.text}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <p className="text-sm text-gray-400">Tổng thông báo</p>
            <p className="text-3xl font-bold mt-2">{notifications.length}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <p className="text-sm text-gray-400">Chưa đọc</p>
            <p className="text-3xl font-bold mt-2">{unreadCount}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <p className="text-sm text-gray-400">Đã đọc</p>
            <p className="text-3xl font-bold mt-2">{notifications.length - unreadCount}</p>
          </div>
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc thông báo">
          {[
            ['all', 'Tất cả'],
            ['info', 'Thông tin'],
            ['success', 'Thành công'],
            ['warning', 'Cảnh báo'],
            ['error', 'Lỗi'],
          ].map(([value, label]) => (
            <button
              type="button"
              key={value}
              onClick={() => setFilter(value)}
              aria-pressed={filter === value}
              className={`px-4 py-2 rounded-lg ${filter === value ? 'bg-purple-600' : 'bg-gray-800 hover:bg-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3" aria-live="polite">
          {filtered.map((item) => {
            const config = typeConfig[item.type] || typeConfig.info;
            const Icon = config.icon;
            return (
              <article
                key={item.id}
                className={`border rounded-xl p-4 md:p-5 ${config.className} ${item.read ? 'opacity-70' : ''}`}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="mt-0.5"><Icon className="w-5 h-5" aria-hidden="true" /></span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold text-lg break-words">{item.title || 'Thông báo hệ thống'}</h2>
                        {!item.read && (
                          <span className="text-[11px] uppercase tracking-wide rounded-full bg-white/10 px-2 py-0.5">Mới</span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-white/80 whitespace-pre-wrap break-words">
                        {item.message || 'Không có nội dung chi tiết.'}
                      </p>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/60">
                        <span>{config.label}</span>
                        <span>{item.source || 'system'}</span>
                        <span className="flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" aria-hidden="true" /> {formatDate(item.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!item.read && (
                      <button
                        type="button"
                        onClick={() => markRead(item.id)}
                        className="p-2 rounded-lg hover:bg-white/10"
                        title="Đánh dấu đã đọc"
                        aria-label={`Đánh dấu đã đọc: ${item.title}`}
                      >
                        <Check className="w-4 h-4" aria-hidden="true" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => removeNotification(item.id)}
                      className="p-2 rounded-lg hover:bg-white/10"
                      title="Xóa thông báo"
                      aria-label={`Xóa thông báo: ${item.title}`}
                    >
                      <Trash2 className="w-4 h-4" aria-hidden="true" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          {filtered.length === 0 && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-10 text-center text-gray-400">
              Không có thông báo phù hợp với bộ lọc hiện tại.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;
