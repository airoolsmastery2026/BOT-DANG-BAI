import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity, AlertTriangle, Building2, CheckCircle2, Clock3, RefreshCw, Server, Share2,
} from 'lucide-react';

const readSettings = (key, defaults) => {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(key) || '{}') };
  } catch {
    return defaults;
  }
};

const request = async (baseUrl, path, apiKey = '') => {
  const response = await fetch(`${String(baseUrl).replace(/\/$/, '')}${path}`, {
    headers: apiKey ? { 'X-API-Key': apiKey } : {},
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
  return payload;
};

const statusStyle = (online) => online
  ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'
  : 'text-red-300 bg-red-500/10 border-red-500/30';

const SystemDashboard = ({ onNavigate }) => {
  const settings = useMemo(() => ({
    zalo: readSettings('zalo_server_settings', { baseUrl: 'http://localhost:8787', apiKey: '' }),
    linkedin: readSettings('linkedin_server_settings', { serverUrl: 'http://localhost:8790', apiKey: '' }),
    realEstate: readSettings('real_estate_server_settings', { baseUrl: 'http://localhost:8791', apiKey: '' }),
  }), []);

  const [services, setServices] = useState({ zalo: null, linkedin: null, realEstate: null });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const nextServices = {};
    const nextErrors = {};

    const checks = [
      ['zalo', request(settings.zalo.baseUrl, '/health', settings.zalo.apiKey)],
      ['linkedin', request(settings.linkedin.serverUrl, '/health', settings.linkedin.apiKey)],
      ['realEstate', Promise.all([
        request(settings.realEstate.baseUrl, '/health', settings.realEstate.apiKey),
        request(settings.realEstate.baseUrl, '/api/real-estate/stats', settings.realEstate.apiKey),
      ]).then(([health, stats]) => ({ ...health, stats: stats.stats || {} }))],
    ];

    await Promise.all(checks.map(async ([key, promise]) => {
      try {
        nextServices[key] = await promise;
      } catch (error) {
        nextServices[key] = null;
        nextErrors[key] = error.message;
      }
    }));

    setServices(nextServices);
    setErrors(nextErrors);
    setUpdatedAt(new Date());
    setLoading(false);
  }, [settings]);

  useEffect(() => {
    refresh();
    const timer = setInterval(refresh, 60_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const onlineCount = Object.values(services).filter(Boolean).length;
  const totalServices = 3;
  const realEstateStats = services.realEstate?.stats || {};

  const cards = [
    {
      key: 'zalo', label: 'Zalo OA', icon: Share2, tab: 'zalo', data: services.zalo,
      detail: services.zalo ? `${services.zalo.total ?? services.zalo.messages ?? 0} tác vụ được lưu` : errors.zalo,
    },
    {
      key: 'linkedin', label: 'LinkedIn', icon: Share2, tab: 'linkedin', data: services.linkedin,
      detail: services.linkedin ? `${services.linkedin.total ?? services.linkedin.queueSize ?? 0} bài trong hệ thống` : errors.linkedin,
    },
    {
      key: 'realEstate', label: 'Bất động sản', icon: Building2, tab: 'real-estate', data: services.realEstate,
      detail: services.realEstate ? `${realEstateStats.total ?? services.realEstate.total ?? 0} nguồn hàng` : errors.realEstate,
    },
  ];

  return (
    <div className="text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold flex items-center gap-3"><Activity /> Trung tâm vận hành</h1>
            <p className="text-gray-300 mt-2">Theo dõi trạng thái các dịch vụ và dữ liệu quan trọng trên một màn hình.</p>
          </div>
          <button
            onClick={refresh}
            disabled={loading}
            className="self-start md:self-auto bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg px-4 py-2 flex items-center gap-2"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Đồng bộ
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <p className="text-sm text-gray-400">Dịch vụ trực tuyến</p>
            <p className="text-3xl font-bold mt-2">{onlineCount}/{totalServices}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <p className="text-sm text-gray-400">Tổng nguồn hàng</p>
            <p className="text-3xl font-bold mt-2">{realEstateStats.total ?? 0}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <p className="text-sm text-gray-400">Nguồn hàng còn hiệu lực</p>
            <p className="text-3xl font-bold mt-2">{realEstateStats.active ?? 0}</p>
          </div>
          <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
            <p className="text-sm text-gray-400">Lần đồng bộ cuối</p>
            <p className="text-lg font-semibold mt-3 flex items-center gap-2"><Clock3 className="w-4 h-4" /> {updatedAt ? updatedAt.toLocaleTimeString('vi-VN') : 'Đang tải'}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {cards.map(({ key, label, icon: Icon, tab, data, detail }) => (
            <button
              key={key}
              onClick={() => onNavigate(tab)}
              className="text-left bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-xl p-5 hover:border-purple-500 transition"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="p-2 bg-purple-500/15 rounded-lg"><Icon className="w-5 h-5 text-purple-300" /></span>
                  <div><h2 className="font-bold text-lg">{label}</h2><p className="text-xs text-gray-400 mt-1">Mở trang quản lý</p></div>
                </div>
                <span className={`text-xs border rounded-full px-2.5 py-1 ${statusStyle(Boolean(data))}`}>
                  {data ? 'Online' : 'Offline'}
                </span>
              </div>
              <p className={`mt-5 text-sm ${data ? 'text-gray-300' : 'text-red-300'}`}>{detail || 'Không có dữ liệu trạng thái.'}</p>
            </button>
          ))}
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl p-5">
          <h2 className="font-bold text-lg flex items-center gap-2"><Server className="w-5 h-5" /> Tình trạng hệ thống</h2>
          <div className="mt-4 space-y-3">
            {cards.map(({ key, label, data }) => (
              <div key={key} className="flex items-center justify-between border-b border-gray-700 last:border-0 pb-3 last:pb-0">
                <span className="text-gray-300">{label}</span>
                <span className={`flex items-center gap-2 text-sm ${data ? 'text-emerald-300' : 'text-red-300'}`}>
                  {data ? <CheckCircle2 className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
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
