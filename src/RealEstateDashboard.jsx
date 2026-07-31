import React, { useCallback, useEffect, useState } from 'react';
import { Building2, ChevronLeft, ChevronRight, Plus, RefreshCw, Search, Server, Trash2 } from 'lucide-react';
import {
  createListing,
  deleteListing,
  getListingStats,
  getListings,
  getRealEstateHealth,
  updateListing,
} from './real_estate_server_api';

const SETTINGS_KEY = 'real_estate_server_settings';
const EMPTY_FORM = {
  title: '', type: 'Căn hộ', transaction: 'Bán', location: '', price: '', area: '', contact: '', phone: '', notes: '', status: 'Mới',
};
const TYPES = ['Căn hộ', 'Nhà phố', 'Biệt thự', 'Đất nền', 'Kho xưởng', 'Văn phòng'];
const STATUSES = ['Mới', 'Đang chăm sóc', 'Đã đặt cọc', 'Đã giao dịch'];

const loadSettings = () => {
  try {
    return JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
  } catch {
    return {};
  }
};

const formatPrice = (value) => {
  const number = Number(value || 0);
  return number ? `${new Intl.NumberFormat('vi-VN').format(number)} triệu` : 'Liên hệ';
};

const RealEstateDashboard = () => {
  const saved = loadSettings();
  const [baseUrl, setBaseUrl] = useState(saved.baseUrl || 'http://localhost:8791');
  const [apiKey, setApiKey] = useState(saved.apiKey || '');
  const [serverHealth, setServerHealth] = useState(null);
  const [listings, setListings] = useState([]);
  const [stats, setStats] = useState({ total: 0, selling: 0, renting: 0, active: 0 });
  const [form, setForm] = useState(EMPTY_FORM);
  const [filters, setFilters] = useState({ q: '', type: '', transaction: '', status: '' });
  const [page, setPage] = useState(1);
  const [pageSize] = useState(12);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [health, listingData, statsData] = await Promise.all([
        getRealEstateHealth(baseUrl),
        getListings(baseUrl, apiKey, { ...filters, page, pageSize }),
        getListingStats(baseUrl, apiKey),
      ]);
      setServerHealth(health);
      setListings(listingData.items || []);
      setTotal(listingData.total || 0);
      setStats(statsData.stats || { total: 0, selling: 0, renting: 0, active: 0 });
      setNotice(null);
    } catch (error) {
      setServerHealth(null);
      setNotice({ type: 'error', text: error.message });
    } finally {
      setLoading(false);
    }
  }, [apiKey, baseUrl, filters, page, pageSize]);

  useEffect(() => {
    const timer = setTimeout(refresh, 250);
    return () => clearTimeout(timer);
  }, [refresh]);

  const saveSettings = async () => {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify({ baseUrl: baseUrl.trim(), apiKey: apiKey.trim() }));
    setNotice({ type: 'success', text: 'Đã lưu cấu hình máy chủ bất động sản.' });
    await refresh();
  };

  const addListing = async (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.location.trim()) {
      setNotice({ type: 'error', text: 'Tên và địa điểm bất động sản là bắt buộc.' });
      return;
    }
    setLoading(true);
    try {
      await createListing(baseUrl, apiKey, form);
      setForm(EMPTY_FORM);
      setPage(1);
      setNotice({ type: 'success', text: 'Đã lưu nguồn hàng lên máy chủ.' });
      await refresh();
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
      setLoading(false);
    }
  };

  const changeStatus = async (item, status) => {
    try {
      await updateListing(baseUrl, apiKey, item.id, { status });
      await refresh();
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    }
  };

  const removeListing = async (id) => {
    try {
      await deleteListing(baseUrl, apiKey, id);
      setNotice({ type: 'success', text: 'Đã xóa nguồn hàng.' });
      await refresh();
    } catch (error) {
      setNotice({ type: 'error', text: error.message });
    }
  };

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const updateFilter = (key, value) => {
    setFilters((current) => ({ ...current, [key]: value }));
    setPage(1);
  };

  return (
    <div className="text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-wrap justify-between gap-4">
          <div>
            <h1 className="text-4xl font-bold mb-2 flex items-center gap-3"><Building2 /> Bất động sản</h1>
            <p className="text-gray-300">Quản lý nguồn hàng tập trung trên backend, có tìm kiếm, lọc, phân trang và cập nhật trạng thái.</p>
          </div>
          <div className={`border rounded-lg px-4 py-3 text-sm ${serverHealth ? 'bg-green-900/30 border-green-700' : 'bg-red-900/30 border-red-700'}`}>
            <p className="flex items-center gap-2 font-medium"><Server className="w-4 h-4" /> {serverHealth ? 'Máy chủ đang hoạt động' : 'Chưa kết nối máy chủ'}</p>
            {serverHealth && <p className="text-xs text-gray-300 mt-1">{serverHealth.total} nguồn hàng · API key {serverHealth.apiKeyConfigured ? 'đã bật' : 'chưa bật'}</p>}
          </div>
        </div>

        {notice && <div className={`border rounded-lg p-3 text-sm ${notice.type === 'success' ? 'bg-green-900/30 border-green-700' : 'bg-red-900/30 border-red-700'}`}>{notice.text}</div>}

        <section className="bg-gray-800 border border-gray-700 rounded-lg p-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} placeholder="Server URL" className="md:col-span-2 bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <input type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder="API key" className="bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <button onClick={saveSettings} className="bg-blue-600 hover:bg-blue-700 rounded px-4 py-2">Lưu & kết nối</button>
          </div>
        </section>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['Tổng tin', stats.total], ['Đang bán', stats.selling], ['Cho thuê', stats.renting], ['Còn hiệu lực', stats.active],
          ].map(([label, value]) => (
            <div key={label} className="bg-gray-800 border border-gray-700 rounded-lg p-4">
              <p className="text-xs text-gray-400">{label}</p><p className="text-2xl font-bold mt-1">{value}</p>
            </div>
          ))}
        </div>

        <form onSubmit={addListing} className="bg-gradient-to-br from-gray-800 to-gray-900 border border-gray-700 rounded-lg p-6">
          <h2 className="text-xl font-bold mb-4 flex items-center gap-2"><Plus className="w-5 h-5" /> Thêm nguồn hàng</h2>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Tên bất động sản" className="md:col-span-2 bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="bg-gray-700 border border-gray-600 rounded px-3 py-2">{TYPES.map((type) => <option key={type}>{type}</option>)}</select>
            <select value={form.transaction} onChange={(e) => setForm({ ...form, transaction: e.target.value })} className="bg-gray-700 border border-gray-600 rounded px-3 py-2"><option>Bán</option><option>Cho thuê</option></select>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Địa điểm" className="md:col-span-2 bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Giá (triệu đồng)" className="bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <input type="number" min="0" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Diện tích m²" className="bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Chủ nhà / liên hệ" className="bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="Số điện thoại" className="bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="bg-gray-700 border border-gray-600 rounded px-3 py-2">{STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
            <button disabled={loading} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded px-4 py-2 font-medium">Lưu nguồn hàng</button>
            <textarea value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ghi chú" rows="2" className="md:col-span-4 bg-gray-700 border border-gray-600 rounded px-3 py-2" />
          </div>
        </form>

        <section className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2 flex items-center gap-2 bg-gray-900 rounded px-3"><Search className="w-4 h-4 text-gray-400" /><input value={filters.q} onChange={(e) => updateFilter('q', e.target.value)} placeholder="Tìm tên, địa điểm, liên hệ, số điện thoại..." className="w-full bg-transparent py-2 outline-none" /></div>
            <select value={filters.type} onChange={(e) => updateFilter('type', e.target.value)} className="bg-gray-700 border border-gray-600 rounded px-3 py-2"><option value="">Tất cả loại hình</option>{TYPES.map((type) => <option key={type}>{type}</option>)}</select>
            <select value={filters.transaction} onChange={(e) => updateFilter('transaction', e.target.value)} className="bg-gray-700 border border-gray-600 rounded px-3 py-2"><option value="">Mọi giao dịch</option><option>Bán</option><option>Cho thuê</option></select>
            <select value={filters.status} onChange={(e) => updateFilter('status', e.target.value)} className="bg-gray-700 border border-gray-600 rounded px-3 py-2"><option value="">Mọi trạng thái</option>{STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
          </div>
          <button onClick={refresh} disabled={loading} className="text-sm bg-gray-700 hover:bg-gray-600 disabled:opacity-50 px-3 py-2 rounded flex items-center gap-2"><RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Đồng bộ dữ liệu</button>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {listings.map((item) => (
            <article key={item.id} className="bg-gray-800 border border-gray-700 rounded-lg p-5">
              <div className="flex justify-between gap-3">
                <div><p className="text-xs text-purple-300">{item.transaction} · {item.type}</p><h3 className="text-lg font-bold mt-1">{item.title}</h3></div>
                <button onClick={() => removeListing(item.id)} className="text-red-400" title="Xóa"><Trash2 className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-gray-300 mt-3">{item.location}</p>
              <div className="flex justify-between mt-4 text-sm"><span>{item.area ? `${item.area} m²` : 'Chưa có diện tích'}</span><strong>{formatPrice(item.price)}</strong></div>
              <p className="text-xs text-gray-400 mt-3">{item.contact || 'Chưa có liên hệ'}{item.phone ? ` · ${item.phone}` : ''}</p>
              {item.notes && <p className="text-xs text-gray-500 mt-2 line-clamp-2">{item.notes}</p>}
              <div className="border-t border-gray-700 mt-4 pt-3">
                <select value={item.status} onChange={(e) => changeStatus(item, e.target.value)} className="w-full bg-gray-700 border border-gray-600 rounded px-2 py-1 text-xs">{STATUSES.map((status) => <option key={status}>{status}</option>)}</select>
              </div>
            </article>
          ))}
          {!loading && listings.length === 0 && <p className="text-gray-400 text-sm">Chưa có nguồn hàng phù hợp.</p>}
        </div>

        <div className="flex items-center justify-between bg-gray-800 border border-gray-700 rounded-lg p-3 text-sm">
          <span>Trang {page}/{totalPages} · {total} kết quả</span>
          <div className="flex gap-2">
            <button disabled={page <= 1 || loading} onClick={() => setPage((value) => Math.max(1, value - 1))} className="bg-gray-700 disabled:opacity-40 rounded p-2"><ChevronLeft className="w-4 h-4" /></button>
            <button disabled={page >= totalPages || loading} onClick={() => setPage((value) => Math.min(totalPages, value + 1))} className="bg-gray-700 disabled:opacity-40 rounded p-2"><ChevronRight className="w-4 h-4" /></button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default RealEstateDashboard;
