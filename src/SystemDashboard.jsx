import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Clock3,
  RefreshCw,
  Server,
  Share2,
} from 'lucide-react';

const DEFAULTS = {
  zalo: { baseUrl: 'http://localhost:8787', apiKey: '' },
  linkedin: { serverUrl: 'http://localhost:8790', apiKey: '' },
};

const readSettings = (key, defaults) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? { ...defaults, ...parsed }
      : defaults;
  } catch {
    return defaults;
  }
};

const normalizeBaseUrl = (value) => String(value || '').trim().replace(/\/$/, '');

const request = async (baseUrl, path, apiKey = '', timeoutMs = 8_000) => {
  const normalizedBaseUrl = normalizeBaseUrl(baseUrl);
  if (!normalizedBaseUrl) throw new Error('Chưa cấu hình địa chỉ server.');

  let url;
  try {
    url = new URL(`${normalizedBaseUrl}${path}`);
  } catch {
    throw new Error('Địa chỉ server không hợp lệ.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url.toString(), {
      headers: apiKey ? { 'X-API-Key': String(apiKey).trim() } : {},
      signal: controller.signal,
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
    return payload;
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('Server phản hồi quá thời gian cho phép.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
};

const statusStyle = (online) => online
  ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
  : 'text-red-300 bg-red-500/10 border-red-500/30';

const getErrorMessage = (error) => error instanceof Error ? error.message : 'Không thể kết nối server.';

const SystemDashboard = ({ onNavigate }) => {
  const settings = useMemo(() => ({
    zalo: readSettings('zalo_server_settings', DEFAULTS.zalo),
    linkedin: readSettings('linkedin_server_settings', DEFAULTS.linkedin),
  }), []);

  const mountedRef = useRef(true);
  const [services, setServices] = useState({ zalo: null, linkedin: null });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const refresh = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setLoading(true);

    const checks = await Promise.allSettled([
      request(settings.zalo.baseUrl, '/health', settings.zalo.apiKey),
      request(settings.linkedin.serverUrl, '/health', settings.linkedin.apiKey),
    ]);

    if (!mountedRef.current) return;

    const nextServices = {
      zalo: checks[0].status === 'fulfilled' ? checks[0].value : null,
      linkedin: checks[1].status === 'fulfilled' ? checks[1].value : null,
    };
    const nextErrors = {
      ...(checks[0].status === 'rejected' ? { zalo: getErrorMessage(checks[0].reason) } : {}),
      ...(checks[1].status === 'rejected' ? { linkedin: getErrorMessage(checks[1].reason) } : {}),
    };

    setServices(nextServices);
    setErrors(nextErrors);
    setUpdatedAt(new Date());
    setLoading(false);
  }, [settings]);

  useEffect(() => {
    mountedRef.current = true;
    refresh();

    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') refresh({ silent: true });
    }, 60_000);

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') refresh({ silent: true });
    };
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      mountedRef.current = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [refresh]);

  const cards = useMemo(() => [
    {
      key: 'zalo',
      label: 'Zalo OA',
      icon: Share2,
      tab: 'zalo',
      data: services.zalo,
      detail: services.zalo
        ? `${services.zalo.total ?? services.zalo.messages ?? services.zalo.queued ?? 0} tác vụ được ghi nhận`
        : errors.zalo,
    },
    {
      key: 'linkedin',
      label: 'LinkedIn',
      icon: Share2,
      tab: 'linkedin',
      data: services.linkedin,
      detail: services.linkedin
        ? `${services.linkedin.total ?? services.linkedin.queueSize ?? services.linkedin.queued ?? 0} bài trong hệ thống`
        : errors.linkedin,
    },
  ], [errors, services]);

  const onlineCount = cards.filter((card) => Boolean(card.data)).length;
  const offlineCount = cards.length - onlineCount;

  return (
    <div className="text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h2 className="text-3xl md:text-4xl font-bold flex items-center gap-3"><Activity aria-hidden="true" /> Trung tâm vận hành</h2>
            <p className="text-gray-300 mt-2">Theo dõi connector phân phối nội dung và trạng thái backend theo thời gian thực.</p>
          </div>
          <button
            type="button"
            onClick={() => refresh()}
            disabled={loading}
            aria-busy={loading}
            className="self-start md:self-auto bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg px-4 py-2 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-purple-300"
          >
            <RefreshCw aria-hidden="true" className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Đang đồng bộ' : 'Đồng bộ'}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" aria-live="polite">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <p className="text-sm text-gray-400">Connector trực tuyến</p>
            <p className="text-3xl font-bold mt-2">{onlineCount}/{cards.length}</p>
            <p className="text-xs text-gray-500 mt-2">{offlineCount ? `${offlineCount} connector cần kiểm tra` : 'Tất cả hoạt động bình thường'}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <p className="text-sm text-gray-400">Hàng đợi hợp nhất</p>
            <button type="button" onClick={() => onNavigate('queue')} className="mt-2 text-left text-lg font-semibold text-purple-300 hover:text-purple-200 focus:outline-none focus:ring-2 focus:ring-purple-300 rounded">
              Mở màn hình hàng đợi
            </button>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <p className="text-sm text-gray-400">Lần đồng bộ cuối</p>
            <p className="text-lg font-semibold mt-3 flex items-center gap-2"><Clock3 aria-hidden="true" className="w-4 h-4" /> {updatedAt ? updatedAt.toLocaleString('vi-VN') : 'Đang tải'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {cards.map(({ key, label, icon: Icon, tab, data, detail }) => (
            <button
              key={key}
              type="button"
              onClick={() => onNavigate(tab)}
              aria-label={`Mở trang quản lý ${label}. Trạng thái ${data ? 'online' : 'offline'}.`}
              className="text-left bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-xl p-5 hover:border-purple-500 transition focus:outline-none focus:ring-2 focus:ring-purple-300"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="p-2 bg-purple-500/15 rounded-lg"><Icon aria-hidden="true" className="w-5 h-5 text-purple-300" /></span>
                  <div><h3 className="font-bold text-lg">{label}</h3><p className="text-xs text-gray-400 mt-1">Mở trang quản lý</p></div>
                </div>
                <span className={`text-xs border rounded-full px-2.5 py-1 ${statusStyle(Boolean(data))}`}>
                  {data ? 'Online' : 'Offline'}
                </span>
              </div>
              <p className={`mt-5 text-sm break-words ${data ? 'text-gray-300' : 'text-red-300'}`}>{detail || 'Không có dữ liệu trạng thái.'}</p>
            </button>
          ))}
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h3 className="font-bold text-lg flex items-center gap-2"><Server aria-hidden="true" className="w-5 h-5" /> Tình trạng hệ thống</h3>
          <div className="mt-4 space-y-3">
            {cards.map(({ key, label, data }) => (
              <div key={key} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-gray-700 last:border-0 pb-3 last:pb-0">
                <span className="text-gray-300">{label}</span>
                <span className={`flex items-start gap-2 text-sm sm:text-right break-words ${data ? 'text-emerald-300' : 'text-red-300'}`}>
                  {data ? <CheckCircle2 aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5" /> : <AlertTriangle aria-hidden="true" className="w-4 h-4 shrink-0 mt-0.5" />}
                  {data ? 'Hoạt động bình thường' : errors[key] || 'Không thể kết nối'}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SystemDashboard;
