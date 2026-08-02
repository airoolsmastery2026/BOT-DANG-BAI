import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  Play,
  RefreshCw,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import { ZaloServerAPI } from './zalo_server_api';
import {
  deleteLinkedInPost,
  getLinkedInPosts,
  processLinkedInPosts,
} from './linkedin_server_api';
import {
  POST_STATUS,
  deletePost,
  getScheduledPosts,
  retryPost,
} from './post_manager';

const readSettings = (key, defaults) => {
  try {
    const parsed = JSON.parse(localStorage.getItem(key) || '{}');
    return parsed && typeof parsed === 'object' ? { ...defaults, ...parsed } : defaults;
  } catch {
    return defaults;
  }
};

const normalizeStatus = (value) => String(value || 'scheduled').toLowerCase();
const toArray = (value) => (Array.isArray(value) ? value : []);

const statusLabel = {
  scheduled: 'Đã lên lịch', pending: 'Đang chờ', queued: 'Đang chờ',
  publishing: 'Đang xử lý', processing: 'Đang xử lý', sent: 'Đã gửi',
  published: 'Đã đăng', success: 'Thành công', failed: 'Thất bại', cancelled: 'Đã hủy',
};

const statusClass = (status) => {
  if (['sent', 'published', 'success'].includes(status)) return 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30';
  if (status === 'failed') return 'text-red-300 bg-red-500/10 border-red-500/30';
  if (['publishing', 'processing'].includes(status)) return 'text-amber-300 bg-amber-500/10 border-amber-500/30';
  if (status === 'cancelled') return 'text-gray-300 bg-gray-500/10 border-gray-500/30';
  return 'text-sky-300 bg-sky-500/10 border-sky-500/30';
};

const formatDate = (value) => {
  if (!value) return 'Chưa có thời gian';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString('vi-VN');
};

const getErrorMessage = (error) => error?.message || 'Đã xảy ra lỗi không xác định.';

const mapLocalPosts = () => getScheduledPosts().map((item) => ({
  ...item,
  source: 'local',
  platform: 'social',
  platformLabel: item.platforms.map((value) => value[0].toUpperCase() + value.slice(1)).join(', '),
  status: normalizeStatus(item.status),
  scheduledAt: item.scheduledTime,
  errorText: Object.entries(item.results || {})
    .filter(([, result]) => result?.success === false)
    .map(([platform, result]) => `${platform}: ${result.error || 'Lỗi không xác định'}`)
    .join(' · '),
}));

const QueueMonitor = () => {
  const settings = useMemo(() => ({
    zalo: readSettings('zalo_server_settings', { baseUrl: 'http://localhost:8787', apiKey: '' }),
    linkedin: readSettings('linkedin_server_settings', { serverUrl: 'http://localhost:8790', apiKey: '' }),
  }), []);

  const zaloApi = useMemo(
    () => new ZaloServerAPI(settings.zalo.baseUrl, settings.zalo.apiKey),
    [settings],
  );

  const [jobs, setJobs] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);
  const [actionId, setActionId] = useState('');
  const [notice, setNotice] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const refresh = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const results = await Promise.allSettled([
        zaloApi.listMessages(),
        getLinkedInPosts(settings.linkedin.serverUrl, settings.linkedin.apiKey),
      ]);

      const nextJobs = mapLocalPosts();
      const errors = [];

      if (results[0].status === 'fulfilled') {
        toArray(results[0].value?.messages).forEach((item) => nextJobs.push({
          ...item,
          source: 'server',
          id: item.id || item._id || `zalo-${item.createdAt || Math.random()}`,
          platform: 'zalo',
          platformLabel: 'Zalo OA',
          status: normalizeStatus(item.status),
          content: item.content || item.message || '',
          scheduledAt: item.scheduledTime || item.scheduledAt || item.createdAt,
        }));
      } else {
        errors.push(`Zalo: ${getErrorMessage(results[0].reason)}`);
      }

      if (results[1].status === 'fulfilled') {
        toArray(results[1].value).forEach((item) => nextJobs.push({
          ...item,
          source: 'server',
          id: item.id || item._id || `linkedin-${item.createdAt || Math.random()}`,
          platform: 'linkedin',
          platformLabel: 'LinkedIn',
          status: normalizeStatus(item.status),
          content: item.content || item.commentary || '',
          scheduledAt: item.scheduledTime || item.scheduledAt || item.createdAt,
        }));
      } else {
        errors.push(`LinkedIn: ${getErrorMessage(results[1].reason)}`);
      }

      nextJobs.sort((a, b) => new Date(b.scheduledAt || 0) - new Date(a.scheduledAt || 0));
      setJobs(nextJobs);
      setLastUpdated(new Date());
      setNotice(errors.length ? { type: 'error', text: errors.join(' · ') } : null);
    } catch (error) {
      setJobs(mapLocalPosts());
      setNotice({ type: 'error', text: getErrorMessage(error) });
    } finally {
      if (!silent) setLoading(false);
    }
  }, [settings, zaloApi]);

  useEffect(() => {
    refresh();
    const timer = setInterval(() => refresh(true), 30_000);
    return () => clearInterval(timer);
  }, [refresh]);

  const filteredJobs = filter === 'all' ? jobs : jobs.filter((job) => job.platform === filter);
  const summary = jobs.reduce((acc, job) => {
    acc.total += 1;
    if (['sent', 'published', 'success'].includes(job.status)) acc.success += 1;
    else if (job.status === 'failed') acc.failed += 1;
    else if (['publishing', 'processing'].includes(job.status)) acc.processing += 1;
    else acc.pending += 1;
    return acc;
  }, { total: 0, pending: 0, processing: 0, success: 0, failed: 0 });

  const processQueues = async () => {
    setActionId('process');
    setNotice(null);
    try {
      const results = await Promise.allSettled([
        zaloApi.processQueue(),
        processLinkedInPosts(settings.linkedin.serverUrl, settings.linkedin.apiKey),
      ]);
      const errors = [];
      if (results[0].status === 'rejected') errors.push(`Zalo: ${getErrorMessage(results[0].reason)}`);
      if (results[1].status === 'rejected') errors.push(`LinkedIn: ${getErrorMessage(results[1].reason)}`);
      setNotice(errors.length
        ? { type: 'error', text: `Một số hàng đợi chưa xử lý được: ${errors.join(' · ')}` }
        : { type: 'success', text: 'Đã gửi yêu cầu xử lý cho hàng đợi máy chủ.' });
      await refresh(true);
    } catch (error) {
      setNotice({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setActionId('');
    }
  };

  const removeJob = async (job) => {
    if (!job.id || !window.confirm(`Xóa tác vụ ${job.platformLabel}?`)) return;
    const id = `${job.platform}:${job.id}`;
    setActionId(id);
    setNotice(null);
    try {
      if (job.source === 'local') deletePost(job.id);
      else if (job.platform === 'zalo') await zaloApi.deleteMessage(job.id);
      else await deleteLinkedInPost(settings.linkedin.serverUrl, settings.linkedin.apiKey, job.id);
      setJobs((current) => current.filter((item) => !(item.platform === job.platform && item.id === job.id)));
      setNotice({ type: 'success', text: 'Đã xóa tác vụ.' });
    } catch (error) {
      setNotice({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setActionId('');
    }
  };

  const retryJob = async (job) => {
    if (job.source !== 'local' || job.status !== POST_STATUS.FAILED) return;
    const id = `${job.platform}:${job.id}:retry`;
    setActionId(id);
    setNotice(null);
    try {
      const retried = retryPost(job.id);
      if (!retried) throw new Error('Tác vụ không còn ở trạng thái có thể thử lại.');
      await refresh(true);
      setNotice({ type: 'success', text: 'Đã đưa tác vụ thất bại trở lại hàng đợi.' });
    } catch (error) {
      setNotice({ type: 'error', text: getErrorMessage(error) });
    } finally {
      setActionId('');
    }
  };

  const cards = [
    ['Tổng tác vụ', summary.total], ['Đang chờ', summary.pending],
    ['Đang xử lý', summary.processing], ['Thành công', summary.success], ['Thất bại', summary.failed],
  ];

  return (
    <div className="p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h1 className="flex items-center gap-3 text-3xl font-bold md:text-4xl"><Clock3 /> Hàng đợi hợp nhất</h1>
            <p className="mt-2 text-gray-300">Theo dõi tác vụ Facebook, Instagram, TikTok, Zalo OA và LinkedIn trên một màn hình.</p>
            <p className="mt-1 text-xs text-gray-500">Cập nhật cuối: {lastUpdated ? lastUpdated.toLocaleString('vi-VN') : 'chưa đồng bộ'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => refresh()} disabled={loading || Boolean(actionId)} className="flex items-center gap-2 rounded-lg bg-gray-700 px-4 py-2 hover:bg-gray-600 disabled:opacity-50">
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} /> Đồng bộ
            </button>
            <button type="button" onClick={processQueues} disabled={Boolean(actionId) || loading} className="flex items-center gap-2 rounded-lg bg-purple-600 px-4 py-2 hover:bg-purple-700 disabled:opacity-50">
              {actionId === 'process' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />} Xử lý hàng đợi máy chủ
            </button>
          </div>
        </div>

        {notice && (
          <div role="status" className={`flex items-start gap-2 rounded-lg border p-3 ${notice.type === 'error' ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}>
            {notice.type === 'error' ? <AlertTriangle className="h-5 w-5 shrink-0" /> : <CheckCircle2 className="h-5 w-5 shrink-0" />}
            <span>{notice.text}</span>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
          {cards.map(([label, value]) => (
            <div key={label} className="rounded-xl border border-gray-700 bg-gray-800 p-4">
              <p className="text-sm text-gray-400">{label}</p><p className="mt-2 text-3xl font-bold">{value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc hàng đợi theo nền tảng">
          {[
            ['all', 'Tất cả'],
            ['social', 'Facebook / Instagram / TikTok'],
            ['zalo', 'Zalo OA'],
            ['linkedin', 'LinkedIn'],
          ].map(([value, label]) => (
            <button type="button" key={value} onClick={() => setFilter(value)} aria-pressed={filter === value} className={`rounded-lg px-4 py-2 ${filter === value ? 'bg-purple-600' : 'bg-gray-800 hover:bg-gray-700'}`}>{label}</button>
          ))}
        </div>

        <div className="overflow-hidden rounded-xl border border-gray-700 bg-gray-800">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px]">
              <thead className="bg-gray-900/70 text-left text-sm text-gray-400"><tr><th className="p-4">Nền tảng</th><th className="p-4">Nội dung</th><th className="p-4">Thời gian</th><th className="p-4">Trạng thái</th><th className="p-4 text-right">Thao tác</th></tr></thead>
              <tbody>
                {filteredJobs.map((job) => {
                  const rowActionId = `${job.platform}:${job.id}`;
                  const retryActionId = `${rowActionId}:retry`;
                  return (
                    <tr key={rowActionId} className="border-t border-gray-700 align-top">
                      <td className="p-4 font-medium">{job.platformLabel}</td>
                      <td className="max-w-xl p-4 text-gray-300">
                        <p className="line-clamp-3 whitespace-pre-wrap break-words">{job.content || 'Không có nội dung'}</p>
                        {job.campaignId && <p className="mt-1 text-xs text-purple-300">Campaign: {job.campaignId}</p>}
                        {job.errorText && <p className="mt-1 text-xs text-red-300">{job.errorText}</p>}
                      </td>
                      <td className="p-4 text-sm text-gray-400">{formatDate(job.scheduledAt)}</td>
                      <td className="p-4"><span className={`inline-flex rounded-full border px-2.5 py-1 text-xs ${statusClass(job.status)}`}>{statusLabel[job.status] || job.status}</span></td>
                      <td className="p-4 text-right">
                        {job.source === 'local' && job.status === POST_STATUS.FAILED && (
                          <button type="button" onClick={() => retryJob(job)} disabled={Boolean(actionId)} className="p-2 text-amber-300 hover:text-amber-200 disabled:opacity-50" aria-label="Thử lại tác vụ" title="Thử lại">
                            {actionId === retryActionId ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
                          </button>
                        )}
                        <button type="button" onClick={() => removeJob(job)} disabled={Boolean(actionId)} className="p-2 text-red-300 hover:text-red-200 disabled:opacity-50" aria-label={`Xóa tác vụ ${job.platformLabel}`} title="Xóa tác vụ">
                          {actionId === rowActionId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {loading && filteredJobs.length === 0 && <tr><td colSpan="5" className="p-10 text-center text-gray-400"><Loader2 className="mr-2 inline h-5 w-5 animate-spin" />Đang tải hàng đợi...</td></tr>}
                {!loading && filteredJobs.length === 0 && <tr><td colSpan="5" className="p-10 text-center text-gray-400">Chưa có tác vụ trong hàng đợi.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default QueueMonitor;
