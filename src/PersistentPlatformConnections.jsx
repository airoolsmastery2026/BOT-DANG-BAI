import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  BookOpen,
  CheckCircle2,
  ExternalLink,
  Eye,
  EyeOff,
  HardDrive,
  KeyRound,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Trash2,
} from 'lucide-react';
import { PERSISTENT_PLATFORM_CONNECTIONS } from './persistent_platform_connection_catalog';
import {
  getDesktopWorkerHealth,
  isDesktopPublishingWorkerAvailable,
  mapWorkerAccounts,
  removeDesktopWorkerAccount,
  saveDesktopWorkerAccount,
  verifyDesktopWorkerAccount,
} from './desktop_publishing_worker';

const initialForm = Object.fromEntries(PERSISTENT_PLATFORM_CONNECTIONS.map((platform) => [
  platform.id,
  { accessToken: '', [platform.targetKey]: '' },
]));
const noop = () => undefined;

const HelpLink = ({ link }) => (
  <a href={link.href} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-xs font-semibold text-amber-300 hover:bg-amber-400/10 hover:text-amber-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-300">
    {link.label} <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
  </a>
);

const accountStatus = (account) => {
  if (!account?.configured) return { label: 'Chưa lưu trong vault', style: 'text-slate-400 border-white/10 bg-white/5' };
  if (account.ready) return { label: 'Đã xác minh LIVE', style: 'text-emerald-200 border-emerald-500/30 bg-emerald-500/10' };
  if (account.verificationStatus === 'stale') return { label: 'Cần xác minh lại', style: 'text-amber-200 border-amber-500/30 bg-amber-500/10' };
  if (account.verificationStatus === 'error') return { label: 'Xác minh lỗi', style: 'text-red-200 border-red-500/30 bg-red-500/10' };
  return { label: 'Đã mã hóa · chưa xác minh', style: 'text-sky-200 border-sky-500/30 bg-sky-500/10' };
};

const PersistentPlatformConnections = ({ onAccountsChange = noop }) => {
  const desktopAvailable = isDesktopPublishingWorkerAvailable();
  const [form, setForm] = useState(initialForm);
  const [accounts, setAccounts] = useState({});
  const [workerHealth, setWorkerHealth] = useState(null);
  const [visibleTokens, setVisibleTokens] = useState({});
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState(null);

  const configuredCount = useMemo(() => Object.values(accounts).filter((account) => account.configured).length, [accounts]);
  const readyCount = useMemo(() => Object.values(accounts).filter((account) => account.ready).length, [accounts]);

  const refresh = useCallback(async ({ quiet = false } = {}) => {
    if (!desktopAvailable) return;
    if (!quiet) setBusy('refresh');
    try {
      const health = await getDesktopWorkerHealth();
      const nextAccounts = mapWorkerAccounts(health);
      setWorkerHealth(health);
      setAccounts(nextAccounts);
      onAccountsChange(nextAccounts);
      if (!quiet) setNotice({ type: 'success', text: 'Publishing Worker đang chạy và kho credential mã hóa đã sẵn sàng.' });
    } catch (error) {
      setWorkerHealth(null);
      setAccounts({});
      onAccountsChange({});
      setNotice({ type: 'error', text: error.message || 'Không thể kết nối Publishing Worker tích hợp.' });
    } finally {
      if (!quiet) setBusy('');
    }
  }, [desktopAvailable, onAccountsChange]);

  useEffect(() => {
    void refresh({ quiet: true });
  }, [refresh]);

  const updateField = (platform, key, value) => {
    setForm((current) => ({
      ...current,
      [platform]: { ...current[platform], [key]: value },
    }));
    setNotice(null);
  };

  const save = async (platform) => {
    const config = PERSISTENT_PLATFORM_CONNECTIONS.find((item) => item.id === platform);
    const values = form[platform];
    if (!values.accessToken.trim() || !values[config.targetKey].trim()) {
      return setNotice({ type: 'error', text: `${config.label}: cần nhập đủ token và ${config.targetLabel}.` });
    }
    setBusy(`save:${platform}`);
    setNotice(null);
    try {
      await saveDesktopWorkerAccount(platform, {
        accessToken: values.accessToken.trim(),
        [config.targetKey]: values[config.targetKey].trim(),
      });
      setForm((current) => ({
        ...current,
        [platform]: { ...current[platform], accessToken: '' },
      }));
      setVisibleTokens((current) => ({ ...current, [platform]: false }));
      await refresh({ quiet: true });
      setNotice({ type: 'success', text: `${config.label}: token đã được chuyển vào encrypted vault và xóa khỏi ô nhập.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || `Không thể lưu ${config.label}.` });
    } finally {
      setBusy('');
    }
  };

  const verify = async (platform) => {
    const config = PERSISTENT_PLATFORM_CONNECTIONS.find((item) => item.id === platform);
    setBusy(`verify:${platform}`);
    setNotice(null);
    try {
      const result = await verifyDesktopWorkerAccount(platform);
      await refresh({ quiet: true });
      const accountName = result?.account?.name || result?.account?.id || config.label;
      setNotice({ type: 'success', text: `${config.label}: đã xác minh LIVE với ${accountName}.` });
    } catch (error) {
      await refresh({ quiet: true });
      setNotice({ type: 'error', text: error.message || `Xác minh ${config.label} thất bại.` });
    } finally {
      setBusy('');
    }
  };

  const remove = async (platform) => {
    const config = PERSISTENT_PLATFORM_CONNECTIONS.find((item) => item.id === platform);
    setBusy(`remove:${platform}`);
    setNotice(null);
    try {
      await removeDesktopWorkerAccount(platform);
      setForm((current) => ({
        ...current,
        [platform]: { accessToken: '', [config.targetKey]: '' },
      }));
      await refresh({ quiet: true });
      setNotice({ type: 'success', text: `${config.label}: đã xóa credential khỏi encrypted vault.` });
    } catch (error) {
      setNotice({ type: 'error', text: error.message || `Không thể xóa ${config.label}.` });
    } finally {
      setBusy('');
    }
  };

  return (
    <section className="space-y-5 rounded-2xl border border-sky-400/20 bg-slate-950/45 p-5" aria-labelledby="persistent-connections-title">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-sky-300"><HardDrive className="h-4 w-4" /> Persistent Worker 24/7</p>
          <h3 id="persistent-connections-title" className="mt-2 text-2xl font-bold">LinkedIn · Pinterest · YouTube/Shorts</h3>
          <p className="mt-2 max-w-3xl text-sm text-slate-300">Bản Windows tự khởi động worker cục bộ. Token được mã hóa trong vault trên máy bằng khóa được Windows bảo vệ; giao diện không lưu token vào localStorage hoặc sessionStorage.</p>
          <p className="mt-2 text-sm text-slate-400">Đã cấu hình: {configuredCount}/3 · Sẵn sàng LIVE: {readyCount}/{configuredCount}</p>
        </div>
        <button type="button" onClick={() => refresh()} disabled={!desktopAvailable || Boolean(busy)} className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold hover:bg-white/10 disabled:opacity-40">
          <RefreshCw className={`h-4 w-4 ${busy === 'refresh' ? 'animate-spin' : ''}`} /> Kiểm tra worker
        </button>
      </div>

      {!desktopAvailable && (
        <div role="status" className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Trang web không có cầu nối bảo mật desktop. Hãy mở chức năng này trong bản BOT ĐĂNG BÀI đã cài trên Windows.</span>
        </div>
      )}

      {desktopAvailable && workerHealth && (
        <div className="flex items-start gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 text-sm text-emerald-100">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Worker RUNNING · kiểm tra hàng đợi mỗi {Math.round((workerHealth.intervalMs || 30000) / 1000)} giây · {workerHealth.queue?.total || 0} job.</span>
        </div>
      )}

      {notice && (
        <div role="status" className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm ${notice.type === 'error' ? 'border-red-500/30 bg-red-500/10 text-red-200' : 'border-emerald-500/30 bg-emerald-500/10 text-emerald-200'}`}>
          {notice.type === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
          <span>{notice.text}</span>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-3">
        {PERSISTENT_PLATFORM_CONNECTIONS.map((platform) => {
          const account = accounts[platform.id];
          const status = accountStatus(account);
          const values = form[platform.id];
          const platformBusy = busy.endsWith(`:${platform.id}`);
          return (
            <article key={platform.id} className="rounded-2xl border border-white/10 bg-gray-900/80 p-5 shadow-xl">
              <div className="flex items-start justify-between gap-3">
                <h4 className="text-lg font-bold">{platform.label}</h4>
                <span className={`rounded-full border px-2.5 py-1 text-[11px] ${status.style}`}>{status.label}</span>
              </div>

              <div className="mt-4 space-y-3">
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label htmlFor={`${platform.id}-persistent-token`} className="flex items-center gap-2 text-sm font-medium text-gray-200"><KeyRound className="h-4 w-4" /> {platform.tokenLabel}</label>
                    <HelpLink link={platform.tokenHelp} />
                  </div>
                  <div className="relative">
                    <input id={`${platform.id}-persistent-token`} type={visibleTokens[platform.id] ? 'text' : 'password'} autoComplete="off" value={values.accessToken} onChange={(event) => updateField(platform.id, 'accessToken', event.target.value)} placeholder={platform.tokenPlaceholder} disabled={!desktopAvailable || platformBusy} className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 pr-11 text-white outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:opacity-50" />
                    <button type="button" onClick={() => setVisibleTokens((current) => ({ ...current, [platform.id]: !current[platform.id] }))} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white" aria-label={visibleTokens[platform.id] ? 'Ẩn token' : 'Hiện token'}>{visibleTokens[platform.id] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}</button>
                  </div>
                </div>
                <div>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <label htmlFor={`${platform.id}-persistent-target`} className="text-sm font-medium text-gray-200">{platform.targetLabel}</label>
                    <HelpLink link={platform.targetHelp} />
                  </div>
                  <input id={`${platform.id}-persistent-target`} value={values[platform.targetKey]} onChange={(event) => updateField(platform.id, platform.targetKey, event.target.value)} placeholder={platform.targetPlaceholder} disabled={!desktopAvailable || platformBusy} className="w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none focus:border-sky-400 focus:ring-2 focus:ring-sky-400/20 disabled:opacity-50" />
                </div>
              </div>

              <details className="mt-4 rounded-xl border border-white/10 bg-slate-950/40 text-sm open:border-amber-400/20">
                <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2.5 font-semibold text-amber-200"><BookOpen className="h-4 w-4" /> Cách lấy đúng token &amp; ID</summary>
                <div className="border-t border-white/10 px-3 pb-3 pt-2 text-xs text-gray-300">
                  <ol className="list-decimal space-y-1.5 pl-4">{platform.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                  <div className="mt-3 flex flex-wrap gap-2"><HelpLink link={platform.portal} /><HelpLink link={platform.docs} /></div>
                </div>
              </details>

              {account?.lastVerificationAttemptAt && <p className="mt-3 text-xs text-slate-500">Kiểm tra gần nhất: {new Date(account.lastVerificationAttemptAt).toLocaleString('vi-VN')}</p>}
              {account?.verificationErrorCode && <p className="mt-2 text-xs text-red-300">Mã lỗi: {account.verificationErrorCode}</p>}

              <div className="mt-4 flex flex-wrap gap-2">
                <button type="button" onClick={() => save(platform.id)} disabled={!desktopAvailable || Boolean(busy)} className="inline-flex items-center gap-2 rounded-xl bg-sky-600 px-3 py-2 text-sm font-semibold hover:bg-sky-500 disabled:opacity-40">{busy === `save:${platform.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Lưu mã hóa</button>
                <button type="button" onClick={() => verify(platform.id)} disabled={!desktopAvailable || Boolean(busy) || !account?.configured} className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-40">{busy === `verify:${platform.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Xác minh</button>
                <button type="button" onClick={() => remove(platform.id)} disabled={!desktopAvailable || Boolean(busy) || !account?.configured} className="inline-flex items-center gap-2 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-sm text-red-200 hover:bg-red-500/20 disabled:opacity-40">{busy === `remove:${platform.id}` ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Xóa</button>
              </div>
            </article>
          );
        })}
      </div>

      <p className="text-xs text-slate-400">Lưu ý: access token do nền tảng cấp có thời hạn và quyền phụ thuộc trạng thái phê duyệt ứng dụng. Khi token hết hạn, dán token mới rồi xác minh lại; BOT không thể bỏ qua OAuth, quyền tài khoản hoặc quy trình review của nền tảng.</p>
    </section>
  );
};

export default PersistentPlatformConnections;
