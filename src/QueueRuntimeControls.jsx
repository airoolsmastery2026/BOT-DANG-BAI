import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Play, RotateCcw, ShieldCheck, Stethoscope } from 'lucide-react';
import {
  checkAndPublishDuePosts,
  getQueueSummary,
  recoverStuckPosts,
  retryFailedPosts,
} from './post_manager';
import { inspectQueueHealth } from './queue_health';

const QueueRuntimeControls = ({ apiCredentials = {}, onQueueChanged }) => {
  const [action, setAction] = useState('');
  const [notice, setNotice] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [healthReport, setHealthReport] = useState(null);

  const summary = useMemo(() => getQueueSummary(), [refreshKey]);
  const credentialCount = Object.values(apiCredentials).filter(Boolean).length;

  const finish = () => {
    setRefreshKey((value) => value + 1);
    onQueueChanged?.();
  };

  const processDue = async () => {
    setAction('process');
    setNotice(null);
    try {
      const processed = await checkAndPublishDuePosts(apiCredentials);
      const failed = processed.filter((post) => post.status === 'failed').length;
      setNotice({
        type: failed ? 'error' : 'success',
        text: processed.length
          ? `Đã xử lý ${processed.length} bài đến hạn${failed ? `, ${failed} bài thất bại` : ''}.`
          : 'Không có bài local nào đến hạn.',
      });
      setHealthReport(inspectQueueHealth({ credentials: apiCredentials }));
      finish();
    } catch (error) {
      setNotice({ type: 'error', text: error?.message || 'Không thể xử lý hàng đợi local.' });
    } finally {
      setAction('');
    }
  };

  const recoverStuck = () => {
    setAction('recover');
    setNotice(null);
    try {
      const recovered = recoverStuckPosts();
      setNotice({
        type: 'success',
        text: recovered
          ? `Đã khôi phục ${recovered} tác vụ bị kẹt.`
          : 'Không phát hiện tác vụ publishing bị kẹt.',
      });
      setHealthReport(inspectQueueHealth({ credentials: apiCredentials }));
      finish();
    } catch (error) {
      setNotice({ type: 'error', text: error?.message || 'Không thể khôi phục tác vụ.' });
    } finally {
      setAction('');
    }
  };

  const retryAll = () => {
    setAction('retry');
    setNotice(null);
    try {
      const retried = retryFailedPosts({ limit: 100 });
      setNotice({
        type: 'success',
        text: retried
          ? `Đã đưa ${retried} tác vụ thất bại trở lại hàng đợi.`
          : 'Không có tác vụ thất bại để thử lại.',
      });
      setHealthReport(inspectQueueHealth({ credentials: apiCredentials }));
      finish();
    } catch (error) {
      setNotice({ type: 'error', text: error?.message || 'Không thể thử lại hàng loạt.' });
    } finally {
      setAction('');
    }
  };

  const runHealthCheck = () => {
    setAction('health');
    setNotice(null);
    try {
      const report = inspectQueueHealth({ credentials: apiCredentials });
      setHealthReport(report);
      setNotice({
        type: report.healthy ? 'success' : 'error',
        text: report.summary.total
          ? `Đã phát hiện ${report.summary.error} lỗi và ${report.summary.warning} cảnh báo.`
          : 'Hàng đợi local không có vấn đề được phát hiện.',
      });
    } catch (error) {
      setNotice({ type: 'error', text: error?.message || 'Không thể kiểm tra sức khỏe hàng đợi.' });
    } finally {
      setAction('');
    }
  };

  return (
    <section className="mx-auto max-w-7xl px-4 pt-4 text-white md:px-8 md:pt-8" aria-label="Điều khiển hàng đợi local">
      <div className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 shadow-xl md:p-5">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-purple-300">Local Queue Runtime</p>
            <h2 className="mt-1 text-xl font-bold">Điều khiển xử lý hàng đợi</h2>
            <p className="mt-1 text-sm text-gray-400">
              {summary.scheduled} chờ · {summary.due} đến hạn · {summary.failed} thất bại · {credentialCount}/3 token trong phiên
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={processDue} disabled={Boolean(action)} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500 disabled:opacity-40">
              {action === 'process' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Xử lý bài đến hạn
            </button>
            <button type="button" onClick={retryAll} disabled={Boolean(action) || summary.failed === 0} className="inline-flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-semibold hover:bg-amber-500 disabled:opacity-40">
              {action === 'retry' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />} Thử lại lỗi
            </button>
            <button type="button" onClick={recoverStuck} disabled={Boolean(action)} className="inline-flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 text-sm font-semibold hover:bg-gray-600 disabled:opacity-40">
              {action === 'recover' ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} Khôi phục tác vụ kẹt
            </button>
            <button type="button" onClick={runHealthCheck} disabled={Boolean(action)} className="inline-flex items-center gap-2 rounded-lg bg-sky-700 px-4 py-2 text-sm font-semibold hover:bg-sky-600 disabled:opacity-40">
              {action === 'health' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Stethoscope className="h-4 w-4" />} Kiểm tra sức khỏe
            </button>
          </div>
        </div>

        {notice && (
          <div role="status" className={`mt-4 flex items-start gap-2 rounded-lg border px-3 py-2 text-sm ${notice.type === 'error' ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}>
            {notice.type === 'error' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />}
            <span>{notice.text}</span>
          </div>
        )}

        {healthReport?.issues.length > 0 && (
          <div className="mt-4 rounded-xl border border-sky-500/20 bg-sky-500/5 p-3">
            <div className="mb-2 flex flex-wrap gap-3 text-xs text-gray-300">
              <span>Lỗi: {healthReport.summary.error}</span>
              <span>Cảnh báo: {healthReport.summary.warning}</span>
              <span>Tổng vấn đề: {healthReport.summary.total}</span>
            </div>
            <div className="max-h-56 space-y-2 overflow-auto pr-1">
              {healthReport.issues.slice(0, 50).map((item, index) => (
                <div key={`${item.code}-${item.postId || 'queue'}-${index}`} className={`rounded-lg border px-3 py-2 text-xs ${item.severity === 'error' ? 'border-red-500/30 bg-red-500/5 text-red-200' : 'border-amber-500/30 bg-amber-500/5 text-amber-100'}`}>
                  <strong>{item.code}</strong>: {item.message}
                  {item.postId && <span className="ml-1 text-gray-400">· {item.postId}</span>}
                  {item.platform && <span className="ml-1 text-gray-400">· {item.platform}</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
};

export default QueueRuntimeControls;
