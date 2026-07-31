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

const seedNotifications = [
  {
    id: 'welcome',
    type: 'info',
    title: 'Trung tâm thông báo đã sẵn sàng',
    message: 'Theo dõi trạng thái hệ thống, hàng đợi và các sự kiện vận hành tại đây.',
    source: 'system',
    createdAt: new Date().toISOString(),
    read: false,
  },
];

const readNotifications = () => {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    return Array.isArray(parsed) ? parsed : seedNotifications;
  } catch {
    return seedNotifications;
  }
};

const persistNotifications = (items) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
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

  const updateNotifications = (updater) => {
    setNotifications((current) => {
      const next = typeof updater === 'function' ? updater(current) : updater;
      persistNotifications(next);
      return next;
    });
  };

  const unreadCount = notifications.filter((item) => !item.read).length;
  const filtered = useMemo(
    () => notifications.filter((item) => filter === 'all' || item.type === filter),
    [notifications, filter],
  );

  const markRead = (id) => {
    updateNotifications((items) => items.map((item) => (
      item.id === id ? { ...item, read: true } : item
    )));
  };

  const markAllRead = () => {
    updateNotifications((items) => items.map((item) => ({ ...item, read: true })));
  };

  const removeNotification = (id) => {
    updateNotifications((items) => items.filter((item) => item.id !== id));
  };

  const clearAll = () => {
    if (!window.confirm('Xóa toàn bộ thông báo?')) return;
    updateNotifications([]);
  };

  return (
    <div className="text-white p-4 md:p-8">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold flex items-center gap-3">
              <Bell /> Trung tâm thông báo
            </h1>
            <p className="text-gray-300 mt-2">Tập trung cảnh báo, lỗi và trạng thái vận hành của toàn bộ ứng dụng.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={markAllRead}
              disabled={unreadCount === 0}
              className="bg-gray-700 hover:bg-gray-600 disabled:opacity-40 rounded-lg px-4 py-2 flex items-center gap-2"
            >
              <Check className="w-4 h-4" /> Đánh dấu đã đọc
            </button>
            <button
              onClick={clearAll}
              disabled={notifications.length === 0}
              className="bg-red-600/80 hover:bg-red-600 disabled:opacity-40 rounded-lg px-4 py-2 flex items-center gap-2"
            >
              <Trash2 className="w-4 h-4" /> Xóa tất cả
            </button>
          </div>
        </div>

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

        <div className="flex flex-wrap gap-2">
          {[
            ['all', 'Tất cả'],
            ['info', 'Thông tin'],
            ['success', 'Thành công'],
            ['warning', 'Cảnh báo'],
            ['error', 'Lỗi'],
          ].map(([value, label]) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={`px-4 py-2 rounded-lg ${filter === value ? 'bg-purple-600' : 'bg-gray-800 hover:bg-gray-700'}`}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-3">
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
                    <span className="mt-0.5"><Icon className="w-5 h-5" /></span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="font-bold text-lg">{item.title}</h2>
                        {!item.read && (
                          <span className="text-[11px] uppercase tracking-wide rounded-full bg-white/10 px-2 py-0.5">Mới</span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-white/80 whitespace-pre-wrap">{item.message}</p>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-white/60">
                        <span>{config.label}</span>
                        <span>{item.source || 'system'}</span>
                        <span className="flex items-center gap-1"><Clock3 className="w-3.5 h-3.5" /> {formatDate(item.createdAt)}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    {!item.read && (
                      <button
                        onClick={() => markRead(item.id)}
                        className="p-2 rounded-lg hover:bg-white/10"
                        title="Đánh dấu đã đọc"
                      >
                        <Check className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => removeNotification(item.id)}
                      className="p-2 rounded-lg hover:bg-white/10"
                      title="Xóa thông báo"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}

          {filtered.length === 0 && (
            <div className="bg-gray-800 border border-gray-700 rounded-xl p-10 text-center text-gray-400">
              Không có thông báo phù hợp.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default NotificationCenter;
