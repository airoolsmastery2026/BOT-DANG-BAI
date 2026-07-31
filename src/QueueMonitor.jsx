import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock3, Loader2, Play, RefreshCw, Trash2 } from 'lucide-react';
import { ZaloServerAPI } from './zalo_server_api';
import {
  deleteLinkedInPost,
  getLinkedInPosts,
  processLinkedInPosts,
} from './linkedin_server_api';

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

      const nextJobs = [];
      const errors = [];

      if (results[0].status === 'fulfilled') {
        toArray(results[0].value?.messages).forEach((item) => nextJobs.push({
          ...item,
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
        : { type: 'success', text: 'Đã gửi yêu cầu xử lý cho tất cả hàng đợi.' });
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
      if (job.platform === 'zalo') await zaloApi.deleteMessage(job.id);
      else await deleteLinkedInPost(settings.linkedin.serverUrl, settings.linkedin.apiKey, job.id);
      setJobs((current) => current.filter((item) => !(item.platform === job.platform && item.id === job.id)));
      setNotice({ type: 'success', text: 'Đã xóa tác vụ.' });
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
    <div className="text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold flex items-center gap-3"><Clock3 /> Hàng đợi hợp nhất</h1>
            <p className="text-gray-300 mt-2">Theo dõi và xử lý tác vụ Zalo OA, LinkedIn trên một màn hình.</p>
            <p className="text-xs text-gray-500 mt-1">Cập nhật cuối: {lastUpdated ? lastUpdated.toLocaleString('vi-VN') : 'chưa đồng bộ'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={() => refresh()} disabled={loading || Boolean(actionId)} className="bg-gray-700 hover:bg-gray-600 disabled:opacity-50 rounded-lg px-4 py-2 flex items-center gap-2">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} /> Đồng bộ
            </button>
            <button onClick={processQueues} disabled={Boolean(actionId) || loading} className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 rounded-lg px-4 py-2 flex items-center gap-2">
              {actionId === 'process' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />} Xử lý hàng đợi
            </button>
          </div>
        </div>

        {notice && (
          <div role="status" className={`border rounded-lg p-3 flex items-start gap-2 ${notice.type === 'error' ? 'border-red-500/40 bg-red-500/10 text-red-200' : 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'}`}>
            {notice.type === 'error' ? <AlertTriangle className="w-5 h-5 shrink-0" /> : <CheckCircle2 className="w-5 h-5 shrink-0" />}
            <span>{notice.text}</span>
          </div>
        )}

        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {cards.map(([label, value]) => (
            <div key={label} className="bg-gray-800 border border-gray-700 rounded-xl p-4">
              <p className="text-sm text-gray-400">{label}</p><p className="text-3xl font-bold mt-2">{value}</p>
            </div>
          ))}
        </div>

        <div className="flex flex-wrap gap-2" role="group" aria-label="Lọc hàng đợi theo nền tảng">
          {[["all", "Tất cả"], ["zalo", "Zalo OA"], ["linkedin", "LinkedIn"]].map(([value, label]) => (
            <button key={value} onClick={() => setFilter(value)} aria-pressed={filter === value} className={`px-4 py-2 rounded-lg ${filter === value ? 'bg-purple-600' : 'bg-gray-800 hover:bg-gray-700'}`}>{label}</button>
          ))}
        </div>

        <div className="bg-gray-800 border border-gray-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[850px]">
              <thead className="bg-gray-900/70 text-left text-sm text-gray-400"><tr><th className="p-4">Nền tảng</th><th className="p-4">Nội dung</th><th className="p-4">Thời gian</th><th className="p-4">Trạng thái</th><th className="p-4 text-right">Thao tác</th></tr></thead>
              <tbody>
                {filteredJobs.map((job) => {
                  const rowActionId = `${job.platform}:${job.id}`;
                  return (
                    <tr key={rowActionId} className="border-t border-gray-700 align-top">
                      <td className="p-4 font-medium">{job.platformLabel}</td>
                      <td className="p-4 text-gray-300 max-w-xl"><p className="line-clamp-3 whitespace-pre-wrap break-words">{job.content || 'Không có nội dung'}</p></td>
                      <td className="p-4 text-sm text-gray-400">{formatDate(job.scheduledAt)}</td>
                      <td className="p-4"><span className={`inline-flex border rounded-full px-2.5 py-1 text-xs ${statusClass(job.status)}`}>{statusLabel[job.status] || job.status}</span></td>
                      <td className="p-4 text-right">
                        <button onClick={() => removeJob(job)} disabled={Boolean(actionId)} className="text-red-300 hover:text-red-200 disabled:opacity-50 p-2" aria-label={`Xóa tác vụ ${job.platformLabel}`} title="Xóa tác vụ">
                          {actionId === rowActionId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                        </button>
                      </td>
                    </tr>
                  );
                })}
                {loading && filteredJobs.length === 0 && <tr><td colSpan="5" className="p-10 text-center text-gray-400"><Loader2 className="w-5 h-5 animate-spin inline mr-2" />Đang tải hàng đợi...</td></tr>}
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
