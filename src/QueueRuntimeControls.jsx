import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, FlaskConical, Loader2, Play, RotateCcw, ShieldCheck, Stethoscope } from 'lucide-react';
import {
  checkAndPublishDuePosts,
  getQueueSummary,
  recoverStuckPosts,
  retryFailedPosts,
} from './post_manager';
import { inspectQueueHealth } from './queue_health';
import { inspectPublisherPreflight } from './publisher_preflight';
import { MOCK_SCENARIO } from './publisher_adapter';
import { getConnectedPlatforms } from './platform_credentials';
import { getPublishingHealth } from './publishing_control_api';

const MOCK_SCENARIO_OPTIONS = [
  [MOCK_SCENARIO.SUCCESS, 'Thành công'],
  [MOCK_SCENARIO.PARTIAL_INSTAGRAM, 'Instagram lỗi'],
  [MOCK_SCENARIO.PARTIAL_TIKTOK, 'TikTok lỗi'],
  [MOCK_SCENARIO.RATE_LIMIT, 'Giả lập 429'],
  [MOCK_SCENARIO.NETWORK_TIMEOUT, 'Giả lập timeout'],
];

const QueueRuntimeControls = ({ apiCredentials = {}, onQueueChanged }) => {
  const [action, setAction] = useState('');
  const [notice, setNotice] = useState(null);
  const [, setRefreshKey] = useState(0);
  const [healthReport, setHealthReport] = useState(null);
  const [preflightReport, setPreflightReport] = useState(null);
  const [schedulerState, setSchedulerState] = useState(null);
  const [mockScenario, setMockScenario] = useState(MOCK_SCENARIO.SUCCESS);

  const summary = getQueueSummary();
  const connectedPlatforms = useMemo(() => getConnectedPlatforms(apiCredentials), [apiCredentials]);
  const connectedAccounts = useMemo(
    () => Object.values(connectedPlatforms).filter(Boolean).length,
    [connectedPlatforms],
  );
  const verifiedAccounts = useMemo(() => {
    if (apiCredentials.__requireVerification !== true) return connectedAccounts;
    return Object.entries(connectedPlatforms)
      .filter(([platform, connected]) => connected && apiCredentials.__verifiedPlatforms?.[platform] === true)
      .length;
  }, [apiCredentials, connectedAccounts, connectedPlatforms]);

  const finish = () => {
    setRefreshKey((value) => value + 1);
    onQueueChanged?.();
  };

  const refreshDiagnostics = (credentials = apiCredentials) => {
    setHealthReport(inspectQueueHealth({ credentials }));
    setPreflightReport(inspectPublisherPreflight({ credentials }));
  };

  const requireLivePublishingEnabled = async () => {
    const health = await getPublishingHealth();
    const scheduler = health?.scheduler || null;
    setSchedulerState(scheduler);
    if (scheduler?.paused) throw new Error('Publishing Scheduler đang tạm dừng bởi Control Plane. Hãy Resume trước khi đăng LIVE.');
  };

  const runPublisher = async (credentials, modeLabel) => {
    const preflight = inspectPublisherPreflight({ credentials });
    setPreflightReport(preflight);
    if (preflight.dueCount === 0) {
      setNotice({ type: 'success', text: 'Không có bài local nào đến hạn.' });
      return;
    }
    if (preflight.runnableCount === 0) {
      setNotice({ type: 'error', text: `${preflight.blockedCount} bài đến hạn đang bị chặn bởi preflight.` });
      return;
    }
    const processed = await checkAndPublishDuePosts(credentials);
    const failed = processed.filter((post) => post.status === 'failed').length;
    const deadLetter = processed.filter((post) => post.status === 'dead_letter').length;
    setNotice({
      type: failed || deadLetter || preflight.blockedCount ? 'error' : 'success',
      text: `${modeLabel}: đã xử lý ${processed.length} bài${failed ? `, ${failed} bài thất bại` : ''}${deadLetter ? `, ${deadLetter} Dead Letter` : ''}${preflight.blockedCount ? `; ${preflight.blockedCount} bài bị chặn` : ''}.`,
    });
    refreshDiagnostics(credentials);
    finish();
  };

  const processDue = async () => {
    setAction('process');
    setNotice(null);
    try {
      await requireLivePublishingEnabled();
      await runPublisher(apiCredentials, 'LIVE');
    } catch (error) {
      setNotice({ type: 'error', text: error?.message || 'Không thể xử lý hàng đợi local.' });
    } finally { setAction(''); }
  };

  const processMock = async () => {
    setAction('mock');
    setNotice(null);
    try {
      await runPublisher({ ...apiCredentials, __publisherMode: 'mock', __mockScenario: mockScenario }, `MOCK/${mockScenario}`);
    } catch (error) {
      setNotice({ type: 'error', text: error?.message || 'Không thể chạy kiểm thử mock.' });
    } finally { setAction(''); }
  };

  const recoverStuck = () => {
    setAction('recover'); setNotice(null);
    try {
      const recovered = recoverStuckPosts();
      setNotice({ type: 'success', text: recovered ? `Đã khôi phục ${recovered} tác vụ bị kẹt.` : 'Không phát hiện tác vụ publishing bị kẹt.' });
      refreshDiagnostics(); finish();
    } catch (error) { setNotice({ type: 'error', text: error?.message || 'Không thể khôi phục tác vụ.' }); }
    finally { setAction(''); }
  };

  const retryAll = () => {
    setAction('retry'); setNotice(null);
    try {
      const retried = retryFailedPosts({ limit: 100 });
      setNotice({ type: 'success', text: retried ? `Đã đưa ${retried} tác vụ thất bại trở lại hàng đợi.` : 'Không có tác vụ thất bại để thử lại.' });
      refreshDiagnostics(); finish();
    } catch (error) { setNotice({ type: 'error', text: error?.message || 'Không thể thử lại hàng loạt.' }); }
    finally { setAction(''); }
  };

  const runHealthCheck = async () => {
    setAction('health'); setNotice(null);
    try {
      const report = inspectQueueHealth({ credentials: apiCredentials });
      const preflight = inspectPublisherPreflight({ credentials: apiCredentials });
      let scheduler = null;
      try { scheduler = (await getPublishingHealth())?.scheduler || null; } catch { scheduler = null; }
      setSchedulerState(scheduler); setHealthReport(report); setPreflightReport(preflight);
      const schedulerMessage = scheduler ? ` Scheduler: ${scheduler.paused ? 'PAUSED' : 'RUNNING'}.` : ' Publishing Control chưa kết nối.';
      setNotice({
        type: report.healthy && preflight.blockedCount === 0 && scheduler?.paused !== true ? 'success' : 'error',
        text: `Sức khỏe: ${report.summary.error} lỗi, ${report.summary.warning} cảnh báo. Preflight: ${preflight.runnableCount} chạy được, ${preflight.blockedCount} bị chặn.${schedulerMessage}`,
      });
    } catch (error) { setNotice({ type: 'error', text: error?.message || 'Không thể kiểm tra sức khỏe hàng đợi.' }); }
    finally { setAction(''); }
  };

  return (
    <section className="mx-auto max-w-7xl px-4 pt-4 text-white md:px-8 md:pt-8" aria-label="Điều khiển hàng đợi local">
      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-xl md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-300">Local Queue Runtime</p>
            <h2 className="mt-1 text-xl font-bold">Điều khiển xử lý hàng đợi</h2>
            <p className="mt-1 text-sm text-gray-400">{summary.scheduled} chờ · {summary.due} đến hạn · {summary.failed} thất bại · {summary.dead_letter || 0} Dead Letter · {verifiedAccounts}/{connectedAccounts} tài khoản đã kiểm tra</p>
            <p className="mt-1 text-xs text-emerald-300">MOCK miễn phí: không cần token, không gửi dữ liệu tới mạng xã hội.</p>
            {schedulerState && <p className={`mt-1 text-xs ${schedulerState.paused ? 'text-amber-300' : 'text-emerald-300'}`}>Remote control: {schedulerState.paused ? 'PAUSED' : 'RUNNING'}{schedulerState.updatedBy ? ` · ${schedulerState.updatedBy}` : ''}</p>}
            {preflightReport && <p className="mt-1 text-xs text-sky-300">Preflight {preflightReport.mode || 'live'}: {preflightReport.runnableCount} sẵn sàng · {preflightReport.blockedCount} bị chặn</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="mock-scenario">Kịch bản kiểm thử mock</label>
            <select id="mock-scenario" value={mockScenario} onChange={(event) => setMockScenario(event.target.value)} disabled={Boolean(action)} className="rounded-lg border border-cyan-500/30 bg-slate-900 px-3 py-2 text-sm text-cyan-100 disabled:opacity-40">
              {MOCK_SCENARIO_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
            <button type="button" onClick={processMock} disabled={Boolean(action)} className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-4 py-2 text-sm font-semibold hover:bg-cyan-600 disabled:opacity-40">{action === 'mock' ? <Loader2 className="h-4 w-4 animate-spin" /> : <FlaskConical className="h-4 w-4" />} Chạy MOCK</button>
            <button type="button" onClick={processDue} disabled={Boolean(action) || schedulerState?.paused === true} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-40">{action === 'process' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Đăng LIVE</button>
            <button type="button" onClick={retryAll} disabled={Boolean(action) || summary.failed === 0} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold hover:bg-amber-500 disabled:opacity-40">{action === 'retry' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Thử lại lỗi</button>
            <button type="button" onClick={recoverStuck} disabled={Boolean(action)} className="inline-flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold hover:bg-gray-600 disabled:opacity-40">{action === 'recover' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Khôi phục tác vụ kẹt</button>
            <button type="button" onClick={runHealthCheck} disabled={Boolean(action)} className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold hover:bg-sky-600 disabled:opacity-40">{action === 'health' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />} Kiểm tra sức khỏe</button>
          </div>
        </div>
        {notice && <div role="status" className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${notice.type === 'error' ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}>{notice.type === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}<span>{notice.text}</span></div>}
        {preflightReport?.issues.length > 0 && <div className="mt-4 rounded-xl border border-violet-500/20 bg-violet-500/5 p-3"><p className="mb-2 text-xs font-semibold uppercase tracking-wide text-violet-200">Publisher Preflight</p><div className="max-h-48 space-y-2 overflow-auto pr-1">{preflightReport.issues.slice(0, 30).map((item, index) => <div key={`${item.code}-${item.postId || 'post'}-${index}`} className="rounded-lg border border-violet-500/20 px-3 py-2 text-xs text-violet-100"><strong>{item.code}</strong>: {item.message}{item.postId && <span className="ml-1 text-gray-400">· {item.postId}</span>}{item.platform && <span className="ml-1 text-gray-400">· {item.platform}</span>}</div>)}</div></div>}
        {healthReport?.issues.length > 0 && <div className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3"><div className="mb-2 flex flex-wrap gap-3 text-xs text-gray-300"><span>Lỗi: {healthReport.summary.error}</span><span>Cảnh báo: {healthReport.summary.warning}</span><span>Tổng vấn đề: {healthReport.summary.total}</span></div><div className="max-h-56 space-y-2 overflow-auto pr-1">{healthReport.issues.slice(0, 50).map((item, index) => <div key={`${item.code}-${item.postId || 'queue'}-${index}`} className={`rounded-lg border px-3 py-2 text-xs ${item.severity === 'error' ? 'border-red-500/30 bg-red-500/5 text-red-200' : 'border-amber-500/30 bg-amber-500/5 text-amber-100'}`}><strong>{item.code}</strong>: {item.message}{item.postId && <span className="ml-1 text-gray-400">· {item.postId}</span>}{item.platform && <span className="ml-1 text-gray-400">· {item.platform}</span>}</div>)}</div></div>}
      </div>
    </section>
  );
};

export default QueueRuntimeControls;
