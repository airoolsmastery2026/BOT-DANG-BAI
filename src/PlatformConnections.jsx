import React, { useState } from 'react';
import { CheckCircle2, KeyRound, Save, Trash2 } from 'lucide-react';
import {
  clearPlatformCredentials,
  getConnectedPlatforms,
  savePlatformCredentials,
} from './platform_credentials';

const FIELDS = [
  ['facebook_token', 'Facebook Page Access Token', 'Facebook'],
  ['instagram_token', 'Instagram Access Token', 'Instagram'],
  ['tiktok_token', 'TikTok Access Token', 'TikTok'],
];

const PlatformConnections = ({ credentials, onChange }) => {
  const [form, setForm] = useState(credentials);
  const [notice, setNotice] = useState(null);
  const connected = getConnectedPlatforms(form);

  const save = () => {
    try {
      const saved = savePlatformCredentials(form);
      onChange(saved);
      setNotice({ type: 'success', text: 'Đã lưu thông tin kết nối trong phiên trình duyệt hiện tại.' });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Không thể lưu thông tin kết nối.' });
    }
  };

  const clear = () => {
    clearPlatformCredentials();
    const empty = { facebook_token: '', instagram_token: '', tiktok_token: '' };
    setForm(empty);
    onChange(empty);
    setNotice({ type: 'success', text: 'Đã xóa toàn bộ token khỏi phiên trình duyệt.' });
  };

  return (
    <section className="p-4 text-white md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">Platform Connections</p>
          <h2 className="mt-2 text-3xl font-bold md:text-4xl">Kết nối nền tảng đăng bài</h2>
          <p className="mt-2 text-gray-300">Token chỉ được giữ trong sessionStorage và tự mất khi đóng phiên trình duyệt.</p>
        </div>

        {notice && (
          <div role="status" className={`rounded-xl border px-4 py-3 text-sm ${notice.type === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
            {notice.text}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-3">
          {Object.entries(connected).map(([platform, isConnected]) => (
            <div key={platform} className="rounded-xl border border-white/10 bg-white/5 p-4">
              <p className="capitalize text-gray-300">{platform}</p>
              <p className={`mt-2 flex items-center gap-2 text-sm ${isConnected ? 'text-emerald-300' : 'text-gray-500'}`}>
                <CheckCircle2 className="h-4 w-4" /> {isConnected ? 'Đã cấu hình' : 'Chưa cấu hình'}
              </p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-gray-900/70 p-5 shadow-xl">
          <div className="space-y-4">
            {FIELDS.map(([key, label, platform]) => (
              <label key={key} className="block">
                <span className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-200"><KeyRound className="h-4 w-4" /> {label}</span>
                <input
                  type="password"
                  autoComplete="off"
                  value={form[key] || ''}
                  onChange={(event) => setForm((current) => ({ ...current, [key]: event.target.value }))}
                  placeholder={`Nhập token ${platform}`}
                  className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20"
                />
              </label>
            ))}
          </div>

          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" onClick={save} className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-3 font-semibold hover:bg-purple-500">
              <Save className="h-4 w-4" /> Lưu trong phiên
            </button>
            <button type="button" onClick={clear} className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-semibold text-red-200 hover:bg-red-500/20">
              <Trash2 className="h-4 w-4" /> Xóa token
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default PlatformConnections;
