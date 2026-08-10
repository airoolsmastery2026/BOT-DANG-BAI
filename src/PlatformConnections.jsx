import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Eye, EyeOff, KeyRound, Loader2, Save, Trash2, Unplug } from 'lucide-react';
import {
  clearPlatformCredentials,
  getConnectedPlatforms,
  getPlatformConnectionIssues,
  savePlatformCredentials,
} from './platform_credentials';
import { verifyAllPlatformConnections, verifyPlatformConnection } from './platform_connection_service';

const PLATFORMS = [
  {
    id: 'facebook',
    label: 'Facebook Page',
    tokenKey: 'facebook_token',
    targetKey: 'facebook_page_id',
    targetLabel: 'Facebook Page ID',
    targetPlaceholder: 'Ví dụ: 123456789012345',
  },
  {
    id: 'instagram',
    label: 'Instagram Business / Creator',
    tokenKey: 'instagram_token',
    targetKey: 'instagram_user_id',
    targetLabel: 'Instagram Business / Creator ID',
    targetPlaceholder: 'Ví dụ: 17841400000000000',
  },
  {
    id: 'tiktok',
    label: 'TikTok',
    tokenKey: 'tiktok_token',
    targetKey: null,
  },
];

const emptyCredentials = {
  facebook_token: '',
  facebook_page_id: '',
  instagram_token: '',
  instagram_user_id: '',
  tiktok_token: '',
};

const PlatformConnections = ({
  credentials = emptyCredentials,
  onChange = () => undefined,
  onVerificationChange = () => undefined,
}) => {
  const [form, setForm] = useState({ ...emptyCredentials, ...credentials });
  const [notice, setNotice] = useState(null);
  const [checking, setChecking] = useState('');
  const [verification, setVerification] = useState({});
  const [visibleTokens, setVisibleTokens] = useState({});

  const connected = useMemo(() => getConnectedPlatforms(form), [form]);
  const issues = useMemo(() => getPlatformConnectionIssues(form), [form]);
  const configuredCount = useMemo(() => Object.values(connected).filter(Boolean).length, [connected]);
  const verifiedCount = useMemo(() => Object.values(verification).filter((result) => result?.ok).length, [verification]);

  const replaceVerification = (next) => {
    setVerification(next);
    onVerificationChange(next);
  };

  const updateVerification = (platform, result) => {
    setVerification((current) => {
      const next = { ...current };
      if (result) next[platform] = result;
      else delete next[platform];
      onVerificationChange(next);
      return next;
    });
  };

  const updateField = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    const platform = PLATFORMS.find((item) => item.tokenKey === key || item.targetKey === key)?.id;
    if (platform) updateVerification(platform, null);
  };

  const save = () => {
    try {
      const saved = savePlatformCredentials(form);
      setForm(saved);
      onChange(saved);
      setNotice({ type: 'success', text: 'Đã lưu cấu hình tài khoản trong phiên trình duyệt này.' });
      return saved;
    } catch (error) {
      setNotice({ type: 'error', text: error.message || 'Không thể lưu thông tin kết nối.' });
      return null;
    }
  };

  const clear = () => {
    clearPlatformCredentials();
    setForm(emptyCredentials);
    replaceVerification({});
    onChange(emptyCredentials);
    setNotice({ type: 'success', text: 'Đã xóa toàn bộ thông tin kết nối khỏi phiên trình duyệt.' });
  };

  const disconnect = (platform) => {
    const config = PLATFORMS.find((item) => item.id === platform);
    if (!config) return;
    const next = {
      ...form,
      [config.tokenKey]: '',
      ...(config.targetKey ? { [config.targetKey]: '' } : {}),
    };
    const saved = savePlatformCredentials(next);
    setForm(saved);
    updateVerification(platform, null);
    onChange(saved);
    setNotice({ type: 'success', text: `Đã ngắt kết nối ${config.label}.` });
  };

  const verify = async (platform) => {
    setChecking(platform);
    setNotice(null);
    try {
      const result = await verifyPlatformConnection(platform, form);
      updateVerification(platform, result);
      setNotice({
        type: result.ok ? 'success' : 'error',
        text: result.ok
          ? `${PLATFORMS.find((item) => item.id === platform)?.label}: kết nối hợp lệ.`
          : result.message,
      });
      if (result.ok) save();
    } catch (error) {
      const result = {
        platform,
        ok: false,
        account: null,
        message: error?.message || 'Không thể kiểm tra kết nối.',
        checkedAt: new Date().toISOString(),
      };
      updateVerification(platform, result);
      setNotice({ type: 'error', text: result.message });
    } finally {
      setChecking('');
    }
  };

  const verifyAll = async () => {
    setChecking('all');
    setNotice(null);
    try {
      const results = await verifyAllPlatformConnections(form);
      const configuredPlatforms = PLATFORMS.filter((platform) => connected[platform.id]);
      const configuredVerification = Object.fromEntries(
        configuredPlatforms.map((platform) => [platform.id, results[platform.id]]),
      );
      replaceVerification(configuredVerification);

      const configuredResults = configuredPlatforms.map((platform) => results[platform.id]);
      const passed = configuredResults.filter((result) => result?.ok).length;
      const failed = configuredResults.length - passed;
      if (passed > 0) save();
      setNotice({
        type: failed ? 'error' : 'success',
        text: configuredResults.length
          ? `Đã kiểm tra ${configuredResults.length} tài khoản: ${passed} hợp lệ${failed ? `, ${failed} cần sửa` : ''}.`
          : 'Chưa có tài khoản nào đủ cấu hình để kiểm tra.',
      });
    } catch (error) {
      setNotice({ type: 'error', text: error?.message || 'Không thể kiểm tra toàn bộ kết nối.' });
    } finally {
      setChecking('');
    }
  };

  return (
    <section className="p-4 text-white md:p-8">
      <div className="mx-auto max-w-5xl space-y-6">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">Account Connection Center</p>
          <h2 className="mt-2 text-3xl font-bold md:text-4xl">Kết nối tài khoản mạng xã hội</h2>
          <p className="mt-2 max-w-3xl text-gray-300">
            Thêm tài khoản dùng để đăng bài và kiểm tra kết nối ngay tại đây. Token chỉ được giữ trong sessionStorage và tự mất khi đóng phiên trình duyệt.
          </p>
          <p className="mt-2 text-sm text-gray-400">Đủ cấu hình: {configuredCount}/3 · Đã kiểm tra trong phiên: {verifiedCount}/{configuredCount}</p>
        </div>

        {notice && (
          <div role="status" className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${notice.type === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
            {notice.type === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{notice.text}</span>
          </div>
        )}

        <div className="grid gap-4 lg:grid-cols-3">
          {PLATFORMS.map((platform) => {
            const isConnected = connected[platform.id];
            const result = verification[platform.id];
            return (
              <article key={platform.id} className="rounded-2xl border border-white/10 bg-gray-900/70 p-5 shadow-xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-bold">{platform.label}</h3>
                    <p className={`mt-1 text-sm ${isConnected ? 'text-emerald-300' : 'text-gray-500'}`}>
                      {isConnected ? 'Đủ cấu hình để sử dụng' : 'Chưa đủ cấu hình'}
                    </p>
                  </div>
                  <span className={`rounded-full border px-2.5 py-1 text-xs ${result?.ok ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200' : result && !result.ok ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-white/10 bg-white/5 text-gray-400'}`}>
                    {result?.ok ? 'Đã kiểm tra' : result ? 'Kiểm tra lỗi' : 'Chưa kiểm tra'}
                  </span>
                </div>

                <div className="mt-4 space-y-3">
                  <label className="block">
                    <span className="mb-1 flex items-center gap-2 text-sm font-medium text-gray-200"><KeyRound className="h-4 w-4" /> Access Token</span>
                    <div className="relative">
                      <input
                        type={visibleTokens[platform.id] ? 'text' : 'password'}
                        autoComplete="off"
                        value={form[platform.tokenKey] || ''}
                        onChange={(event) => updateField(platform.tokenKey, event.target.value)}
                        placeholder={`Nhập token ${platform.label}`}
                        className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 pr-11 text-white outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20"
                      />
                      <button
                        type="button"
                        onClick={() => setVisibleTokens((current) => ({ ...current, [platform.id]: !current[platform.id] }))}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white"
                        aria-label={visibleTokens[platform.id] ? 'Ẩn token' : 'Hiện token'}
                      >
                        {visibleTokens[platform.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>

                  {platform.targetKey && (
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-gray-200">{platform.targetLabel}</span>
                      <input
                        value={form[platform.targetKey] || ''}
                        onChange={(event) => updateField(platform.targetKey, event.target.value)}
                        placeholder={platform.targetPlaceholder}
                        className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20"
                      />
                    </label>
                  )}
                </div>

                {issues[platform.id]?.length > 0 && (
                  <div className="mt-3 rounded-lg border border-amber-500/20 bg-amber-500/5 px-3 py-2 text-xs text-amber-100">
                    {issues[platform.id].join(' · ')}
                  </div>
                )}

                {result?.account && (
                  <div className="mt-3 rounded-lg border border-emerald-500/20 bg-emerald-500/5 px-3 py-2 text-sm text-emerald-100">
                    <strong>{result.account.name || result.account.username || result.account.id}</strong>
                    {result.account.followers !== undefined && <span className="ml-2 text-emerald-300">{result.account.followers} followers</span>}
                  </div>
                )}

                {result && !result.ok && (
                  <div className="mt-3 rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-100">{result.message}</div>
                )}

                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => verify(platform.id)}
                    disabled={Boolean(checking) || issues[platform.id]?.length > 0}
                    className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-3 py-2 text-sm font-semibold hover:bg-purple-500 disabled:opacity-40"
                  >
                    {checking === platform.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                    Kiểm tra kết nối
                  </button>
                  <button
                    type="button"
                    onClick={() => disconnect(platform.id)}
                    disabled={Boolean(checking) || (!form[platform.tokenKey] && !(platform.targetKey && form[platform.targetKey]))}
                    className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm text-gray-300 hover:bg-white/10 disabled:opacity-40"
                  >
                    <Unplug className="h-4 w-4" /> Ngắt
                  </button>
                </div>
              </article>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 rounded-2xl border border-white/10 bg-slate-950/40 p-4">
          <button type="button" onClick={verifyAll} disabled={Boolean(checking) || configuredCount === 0} className="inline-flex items-center gap-2 rounded-xl bg-purple-600 px-4 py-3 font-semibold hover:bg-purple-500 disabled:opacity-40">
            {checking === 'all' ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Kiểm tra tất cả
          </button>
          <button type="button" onClick={save} disabled={Boolean(checking)} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 font-semibold hover:bg-emerald-500 disabled:opacity-40">
            <Save className="h-4 w-4" /> Lưu tất cả trong phiên
          </button>
          <button type="button" onClick={clear} disabled={Boolean(checking)} className="inline-flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 font-semibold text-red-200 hover:bg-red-500/20 disabled:opacity-40">
            <Trash2 className="h-4 w-4" /> Xóa toàn bộ kết nối
          </button>
        </div>
      </div>
    </section>
  );
};

export default PlatformConnections;
