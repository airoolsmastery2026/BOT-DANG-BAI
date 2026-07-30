import React, { useMemo, useState } from 'react';
import { Building2, Plus, Search, Trash2 } from 'lucide-react';

const STORAGE_KEY = 'real_estate_listings';

const loadListings = () => {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  } catch {
    return [];
  }
};

const formatPrice = (value) => {
  const number = Number(value || 0);
  return number ? `${new Intl.NumberFormat('vi-VN').format(number)} triệu` : 'Liên hệ';
};

const RealEstateDashboard = () => {
  const [listings, setListings] = useState(loadListings);
  const [query, setQuery] = useState('');
  const [form, setForm] = useState({
    title: '', type: 'Căn hộ', transaction: 'Bán', location: '', price: '', area: '', contact: '', status: 'Mới',
  });

  const persist = (next) => {
    setListings(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  };

  const addListing = (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.location.trim()) return;
    persist([{
      ...form,
      id: `property_${Date.now()}`,
      createdAt: new Date().toISOString(),
    }, ...listings]);
    setForm({ title: '', type: 'Căn hộ', transaction: 'Bán', location: '', price: '', area: '', contact: '', status: 'Mới' });
  };

  const filtered = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return listings;
    return listings.filter((item) => [item.title, item.location, item.type, item.contact]
      .some((value) => String(value || '').toLowerCase().includes(keyword)));
  }, [listings, query]);

  const stats = {
    total: listings.length,
    selling: listings.filter((item) => item.transaction === 'Bán').length,
    renting: listings.filter((item) => item.transaction === 'Cho thuê').length,
    active: listings.filter((item) => item.status !== 'Đã giao dịch').length,
  };

  return (
    <div className="text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div>
          <h1 className="text-4xl font-bold mb-2 flex items-center gap-3"><Building2 /> Bất động sản</h1>
          <p className="text-gray-300">Quản lý nguồn hàng, khách liên hệ và trạng thái giao dịch.</p>
        </div>

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
            <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value })} className="bg-gray-700 border border-gray-600 rounded px-3 py-2">
              {['Căn hộ', 'Nhà phố', 'Biệt thự', 'Đất nền', 'Kho xưởng', 'Văn phòng'].map((type) => <option key={type}>{type}</option>)}
            </select>
            <select value={form.transaction} onChange={(e) => setForm({ ...form, transaction: e.target.value })} className="bg-gray-700 border border-gray-600 rounded px-3 py-2">
              <option>Bán</option><option>Cho thuê</option>
            </select>
            <input value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} placeholder="Địa điểm" className="md:col-span-2 bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <input type="number" min="0" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} placeholder="Giá (triệu đồng)" className="bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <input type="number" min="0" value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="Diện tích m²" className="bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <input value={form.contact} onChange={(e) => setForm({ ...form, contact: e.target.value })} placeholder="Chủ nhà / liên hệ" className="md:col-span-2 bg-gray-700 border border-gray-600 rounded px-3 py-2" />
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="bg-gray-700 border border-gray-600 rounded px-3 py-2">
              <option>Mới</option><option>Đang chăm sóc</option><option>Đã đặt cọc</option><option>Đã giao dịch</option>
            </select>
            <button className="bg-purple-600 hover:bg-purple-700 rounded px-4 py-2 font-medium">Lưu nguồn hàng</button>
          </div>
        </form>

        <div className="bg-gray-800 border border-gray-700 rounded-lg p-4 flex items-center gap-3">
          <Search className="w-5 h-5 text-gray-400" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Tìm theo tên, địa điểm, loại hoặc liên hệ..." className="flex-1 bg-transparent outline-none" />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((item) => (
            <article key={item.id} className="bg-gray-800 border border-gray-700 rounded-lg p-5">
              <div className="flex justify-between gap-3">
                <div><p className="text-xs text-purple-300">{item.transaction} · {item.type}</p><h3 className="text-lg font-bold mt-1">{item.title}</h3></div>
                <button onClick={() => persist(listings.filter((listing) => listing.id !== item.id))} className="text-red-400" title="Xóa"><Trash2 className="w-5 h-5" /></button>
              </div>
              <p className="text-sm text-gray-300 mt-3">{item.location}</p>
              <div className="flex justify-between mt-4 text-sm"><span>{item.area ? `${item.area} m²` : 'Chưa có diện tích'}</span><strong>{formatPrice(item.price)}</strong></div>
              <div className="border-t border-gray-700 mt-4 pt-3 text-xs text-gray-400 flex justify-between"><span>{item.contact || 'Chưa có liên hệ'}</span><span>{item.status}</span></div>
            </article>
          ))}
          {filtered.length === 0 && <p className="text-gray-400 text-sm">Chưa có nguồn hàng phù hợp.</p>}
        </div>
      </div>
    </div>
  );
};

export default RealEstateDashboard;
