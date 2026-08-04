import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock3,
  FileEdit,
  Plus,
  Send,
  Trash2,
} from 'lucide-react';
import { SCHEDULER_HANDOFF_STORAGE_KEY } from './scheduler_handoff';

const STORAGE_KEY = 'bot_dang_bai_content_operations';
const STATUS = { DRAFT: 'draft', REVIEW: 'review', APPROVED: 'approved' };
const DEFAULT_BRAND = {
  name: 'Đại Hải Phát', website: '',
  voice: 'Chuyên nghiệp, gần gũi, đáng tin cậy',
  audience: 'Khách hàng cần cơ khí dân dụng và nội thất',
  cta: 'Liên hệ để được tư vấn, khảo sát và báo giá.',
};
const DEFAULT_TEMPLATES = [
  { id: 'project', name: 'Công trình đã hoàn thiện', body: 'Giới thiệu hạng mục, nhu cầu khách hàng, giải pháp thi công, vật liệu, điểm nổi bật và lời mời tư vấn.' },
  { id: 'product', name: 'Sản phẩm nổi bật', body: 'Nêu vấn đề khách hàng, lợi ích sản phẩm, thông số chính, lựa chọn phù hợp và CTA.' },
  { id: 'education', name: 'Kiến thức hữu ích', body: 'Giải thích một lỗi thường gặp, cách lựa chọn đúng, lưu ý thi công và lời khuyên thực tế.' },
  { id: 'promotion', name: 'Ưu đãi / chiến dịch', body: 'Nêu ưu đãi, đối tượng phù hợp, thời hạn, điều kiện và CTA rõ ràng.' },
];
const loadState = () => {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return {
      brand: { ...DEFAULT_BRAND, ...(value.brand || {}) },
      templates: Array.isArray(value.templates) && value.templates.length ? value.templates : DEFAULT_TEMPLATES,
      items: Array.isArray(value.items) ? value.items : [],
    };
  } catch {
    return { brand: DEFAULT_BRAND, templates: DEFAULT_TEMPLATES, items: [] };
  }
};
const saveState = (value) => localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
const pad = (value) => String(value).padStart(2, '0');
const toLocalInput = (date = new Date(Date.now() + 60 * 60 * 1000)) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
const platformLabels = { facebook: 'Facebook', instagram: 'Instagram', tiktok: 'TikTok' };
const statusLabels = { draft: 'Bản nháp', review: 'Chờ duyệt', approved: 'Đã duyệt' };

const ContentOperations = ({ onNavigate }) => {
  const initial = useMemo(loadState, []);
  const [brand, setBrand] = useState(initial.brand);
  const [templates, setTemplates] = useState(initial.templates);
  const [items, setItems] = useState(initial.items);
  const [month, setMonth] = useState(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const [form, setForm] = useState({ title: '', topic: '', templateId: DEFAULT_TEMPLATES[0].id, scheduledAt: toLocalInput(), platforms: ['facebook'] });
  const [newTemplate, setNewTemplate] = useState({ name: '', body: '' });
  const [notice, setNotice] = useState('');

  const persist = (next = {}) => saveState({ brand: next.brand || brand, templates: next.templates || templates, items: next.items || items });
  const updateBrand = (key, value) => { const next = { ...brand, [key]: value }; setBrand(next); persist({ brand: next }); };
  const togglePlatform = (platform) => setForm((current) => ({ ...current, platforms: current.platforms.includes(platform) ? current.platforms.filter((item) => item !== platform) : [...current.platforms, platform] }));

  const createItem = (event) => {
    event.preventDefault();
    if (!form.title.trim() || !form.topic.trim() || !form.scheduledAt || form.platforms.length === 0) {
      setNotice('Cần nhập tên, chủ đề, thời gian và ít nhất một nền tảng.'); return;
    }
    const template = templates.find((item) => item.id === form.templateId);
    const nextItem = { id: `content_${Date.now()}`, ...form, title: form.title.trim(), topic: form.topic.trim(), brief: template?.body || '', status: STATUS.DRAFT, createdAt: new Date().toISOString() };
    const next = [nextItem, ...items]; setItems(next); persist({ items: next });
    setForm((current) => ({ ...current, title: '', topic: '', scheduledAt: toLocalInput() }));
    setNotice('Đã tạo bản nháp nội dung.');
  };
  const moveStatus = (id, status) => { const next = items.map((item) => item.id === id ? { ...item, status, updatedAt: new Date().toISOString() } : item); setItems(next); persist({ items: next }); };
  const removeItem = (id) => { const next = items.filter((item) => item.id !== id); setItems(next); persist({ items: next }); };
  const addTemplate = (event) => {
    event.preventDefault(); if (!newTemplate.name.trim() || !newTemplate.body.trim()) return;
    const next = [...templates, { id: `template_${Date.now()}`, name: newTemplate.name.trim(), body: newTemplate.body.trim() }];
    setTemplates(next); persist({ templates: next }); setNewTemplate({ name: '', body: '' });
  };
  const sendToScheduler = (item) => {
    const publishAt = new Date(item.scheduledAt).toISOString();
    localStorage.setItem(SCHEDULER_HANDOFF_STORAGE_KEY, JSON.stringify({ campaignId: item.id, topic: `${item.topic}. ${item.brief}`, platforms: item.platforms, publishAt, scheduleSlots: [publishAt], handedOffAt: new Date().toISOString() }));
    setNotice('Đã chuyển kế hoạch sang trình đăng bài.'); onNavigate('scheduler');
  };

  const monthItems = items.filter((item) => { const date = new Date(item.scheduledAt); return date.getFullYear() === month.getFullYear() && date.getMonth() === month.getMonth(); });
  const daysInMonth = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  const firstWeekday = new Date(month.getFullYear(), month.getMonth(), 1).getDay();
  const calendarCells = Array.from({ length: firstWeekday + daysInMonth }, (_, index) => index < firstWeekday ? null : index - firstWeekday + 1);

  return (
    <div className="p-4 text-white md:p-8"><div className="mx-auto max-w-7xl space-y-6">
      <div><h2 className="flex items-center gap-3 text-3xl font-bold md:text-4xl"><CalendarDays /> Kế hoạch nội dung</h2><p className="mt-2 text-gray-300">Hồ sơ thương hiệu, thư viện mẫu, duyệt bài và lịch xuất bản trên một màn hình.</p></div>
      {notice && <div className="rounded-lg border border-purple-500/40 bg-purple-500/10 p-3 text-sm">{notice}</div>}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="rounded-xl border border-gray-700 bg-gray-800 p-5 lg:col-span-2"><h3 className="mb-4 flex items-center gap-2 text-xl font-bold"><Building2 className="h-5 w-5" /> Hồ sơ thương hiệu</h3><div className="grid gap-3 md:grid-cols-2">
          <input value={brand.name} onChange={(e) => updateBrand('name', e.target.value)} placeholder="Tên thương hiệu" className="rounded border border-gray-600 bg-gray-700 px-3 py-2" />
          <input value={brand.website} onChange={(e) => updateBrand('website', e.target.value)} placeholder="Link website" className="rounded border border-gray-600 bg-gray-700 px-3 py-2" />
          <input value={brand.voice} onChange={(e) => updateBrand('voice', e.target.value)} placeholder="Giọng thương hiệu" className="rounded border border-gray-600 bg-gray-700 px-3 py-2" />
          <input value={brand.audience} onChange={(e) => updateBrand('audience', e.target.value)} placeholder="Khách hàng mục tiêu" className="rounded border border-gray-600 bg-gray-700 px-3 py-2" />
          <textarea value={brand.cta} onChange={(e) => updateBrand('cta', e.target.value)} rows="2" placeholder="CTA mặc định" className="rounded border border-gray-600 bg-gray-700 px-3 py-2 md:col-span-2" />
        </div></div>
        <form onSubmit={addTemplate} className="rounded-xl border border-gray-700 bg-gray-800 p-5"><h3 className="mb-4 flex items-center gap-2 text-xl font-bold"><BookOpen className="h-5 w-5" /> Thêm mẫu</h3><input value={newTemplate.name} onChange={(e) => setNewTemplate({ ...newTemplate, name: e.target.value })} placeholder="Tên mẫu" className="mb-3 w-full rounded border border-gray-600 bg-gray-700 px-3 py-2" /><textarea value={newTemplate.body} onChange={(e) => setNewTemplate({ ...newTemplate, body: e.target.value })} rows="4" placeholder="Cấu trúc nội dung" className="w-full rounded border border-gray-600 bg-gray-700 px-3 py-2" /><button className="mt-3 flex items-center gap-2 rounded bg-purple-600 px-4 py-2"><Plus className="h-4 w-4" /> Lưu mẫu</button></form>
      </section>
      <form onSubmit={createItem} className="rounded-xl border border-gray-700 bg-gradient-to-br from-gray-800 to-gray-900 p-5"><h3 className="mb-4 flex items-center gap-2 text-xl font-bold"><FileEdit className="h-5 w-5" /> Tạo kế hoạch mới</h3><div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4"><input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Tên kế hoạch" className="rounded border border-gray-600 bg-gray-700 px-3 py-2" /><input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="Chủ đề" className="rounded border border-gray-600 bg-gray-700 px-3 py-2" /><select value={form.templateId} onChange={(e) => setForm({ ...form, templateId: e.target.value })} className="rounded border border-gray-600 bg-gray-700 px-3 py-2">{templates.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><input type="datetime-local" value={form.scheduledAt} onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })} className="rounded border border-gray-600 bg-gray-700 px-3 py-2" /></div><div className="mt-4 flex flex-wrap items-center gap-3">{Object.keys(platformLabels).map((platform) => <label key={platform} className="flex items-center gap-2 rounded bg-gray-700 px-3 py-2 text-sm"><input type="checkbox" checked={form.platforms.includes(platform)} onChange={() => togglePlatform(platform)} /> {platformLabels[platform]}</label>)}<button className="ml-auto flex items-center gap-2 rounded bg-indigo-600 px-4 py-2"><Plus className="h-4 w-4" /> Tạo bản nháp</button></div></form>
      <section className="rounded-xl border border-gray-700 bg-gray-800 p-5"><div className="mb-4 flex items-center justify-between"><h3 className="text-xl font-bold">Lịch tháng {month.toLocaleDateString('vi-VN', { month: 'long', year: 'numeric' })}</h3><div className="flex gap-2"><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))} className="rounded bg-gray-700 p-2"><ChevronLeft className="h-4 w-4" /></button><button type="button" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))} className="rounded bg-gray-700 p-2"><ChevronRight className="h-4 w-4" /></button></div></div><div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-400">{['CN','T2','T3','T4','T5','T6','T7'].map((day) => <div key={day} className="py-2">{day}</div>)}</div><div className="grid grid-cols-7 gap-1">{calendarCells.map((day, index) => { const dayItems = day ? monthItems.filter((item) => new Date(item.scheduledAt).getDate() === day) : []; return <div key={`${day || 'empty'}-${index}`} className="min-h-24 rounded border border-gray-700 bg-gray-900/60 p-2">{day && <><div className="text-xs text-gray-400">{day}</div>{dayItems.slice(0, 3).map((item) => <div key={item.id} className="mt-1 truncate rounded bg-purple-500/15 px-1.5 py-1 text-[11px] text-purple-200" title={item.title}>{item.title}</div>)}</>}</div>; })}</div></section>
      <section><h3 className="mb-3 text-xl font-bold">Quy trình nội dung ({items.length})</h3><div className="grid gap-4 lg:grid-cols-3">{[STATUS.DRAFT, STATUS.REVIEW, STATUS.APPROVED].map((status) => <div key={status} className="rounded-xl border border-gray-700 bg-gray-800 p-4"><h4 className="mb-3 flex items-center gap-2 font-bold">{status === STATUS.DRAFT ? <FileEdit className="h-4 w-4" /> : status === STATUS.REVIEW ? <Clock3 className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}{statusLabels[status]}</h4><div className="space-y-3">{items.filter((item) => item.status === status).map((item) => <article key={item.id} className="rounded-lg border border-gray-700 bg-gray-900/70 p-3"><div className="flex justify-between gap-2"><strong className="text-sm">{item.title}</strong><button type="button" onClick={() => removeItem(item.id)} className="text-red-300"><Trash2 className="h-4 w-4" /></button></div><p className="mt-2 text-xs text-gray-300">{item.topic}</p><p className="mt-2 text-[11px] text-gray-500">{new Date(item.scheduledAt).toLocaleString('vi-VN')} · {item.platforms.map((p) => platformLabels[p]).join(', ')}</p><div className="mt-3 flex flex-wrap gap-2">{status === STATUS.DRAFT && <button type="button" onClick={() => moveStatus(item.id, STATUS.REVIEW)} className="rounded bg-blue-600 px-2.5 py-1.5 text-xs">Gửi duyệt</button>}{status === STATUS.REVIEW && <><button type="button" onClick={() => moveStatus(item.id, STATUS.DRAFT)} className="rounded bg-gray-600 px-2.5 py-1.5 text-xs">Trả lại</button><button type="button" onClick={() => moveStatus(item.id, STATUS.APPROVED)} className="rounded bg-green-600 px-2.5 py-1.5 text-xs">Duyệt</button></>}{status === STATUS.APPROVED && <button type="button" onClick={() => sendToScheduler(item)} className="flex items-center gap-1 rounded bg-purple-600 px-2.5 py-1.5 text-xs"><Send className="h-3.5 w-3.5" /> Đưa sang đăng bài</button>}</div></article>)}{items.every((item) => item.status !== status) && <p className="text-sm text-gray-500">Chưa có nội dung.</p>}</div></div>)}</div></section>
    </div></div>
  );
};
export default ContentOperations;
