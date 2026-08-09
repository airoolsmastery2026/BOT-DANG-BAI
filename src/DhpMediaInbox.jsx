import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Download, Inbox, Loader2, RefreshCw } from 'lucide-react';
import { schedulePost } from './post_manager';
import { acknowledgeMediaPackage, fetchPendingMediaPackages } from './dhp_media_inbox';

const supportedPlatforms = new Set(['facebook', 'instagram', 'tiktok']);

const DhpMediaInbox = ({ connectedPlatforms = {}, onQueueChanged = () => undefined }) => {
  const [packages, setPackages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(null);
  const [processingId, setProcessingId] = useState(null);

  const connected = useMemo(
    () => Object.entries(connectedPlatforms).filter(([, enabled]) => enabled).map(([platform]) => platform),
    [connectedPlatforms],
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    setNotice(null);
    try {
      setPackages(await fetchPendingMediaPackages());
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'Không thể tải DHP Media Inbox.' });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const importPackage = async (pkg) => {
    setProcessingId(pkg.id);
    setNotice(null);
    try {
      const requested = Array.isArray(pkg.platforms) ? pkg.platforms.filter((platform) => supportedPlatforms.has(platform)) : [];
      const platforms = (requested.length ? requested : connected).filter((platform) => connectedPlatforms[platform]);
      if (!platforms.length) {
        throw new Error('Media package chưa có nền tảng khả dụng. Hãy kết nối Facebook/Instagram/TikTok trước.');
      }

      const post = schedulePost({
        campaignId: pkg.jobId || pkg.id,
        content: pkg.content,
        platforms,
        scheduledTime: pkg.scheduledTime || new Date(Date.now() + 5 * 60_000).toISOString(),
        imageUrl: pkg.imageUrl || '',
        videoUrl: pkg.videoUrl || '',
        targetIds: pkg.targetIds || {},
      });

      await acknowledgeMediaPackage(pkg.id, post.id);
      setPackages((current) => current.filter((item) => item.id !== pkg.id));
      onQueueChanged();
      setNotice({ type: 'success', message: `Đã đưa media package vào hàng đợi: ${post.id}` });
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'Không thể nhập media package.' });
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="dhp-page p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="dhp-eyebrow">DHP Media Engine · Local</p>
            <h2 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Hộp nhận nội dung</h2>
            <p className="mt-2 max-w-3xl text-slate-400">Nhận gói nội dung từ DHP Agent Control Plane, kiểm tra nhanh rồi đưa vào hàng đợi đăng bài hiện tại.</p>
          </div>
          <button
            type="button"
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center justify-center gap-2 rounded-xl border border-amber-300/20 bg-slate-900/70 px-4 py-2.5 font-semibold text-amber-100 disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            Làm mới
          </button>
        </div>

        {notice && (
          <div className={`rounded-xl border px-4 py-3 text-sm ${notice.type === 'error' ? 'border-red-400/30 bg-red-500/10 text-red-100' : 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100'}`}>
            {notice.message}
          </div>
        )}

        {!loading && packages.length === 0 ? (
          <div className="rounded-2xl border border-white/10 bg-slate-900/50 p-8 text-center">
            <Inbox className="mx-auto h-10 w-10 text-slate-500" />
            <p className="mt-3 font-semibold">Chưa có media package đang chờ.</p>
            <p className="mt-1 text-sm text-slate-400">Khi Control Plane hoàn tất bước publish, nội dung sẽ xuất hiện tại đây.</p>
          </div>
        ) : (
          <div className="grid gap-4 lg:grid-cols-2">
            {packages.map((pkg) => (
              <article key={pkg.id} className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 shadow-xl shadow-black/10">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">{pkg.workflowId || 'media-workflow'}</p>
                    <p className="mt-2 line-clamp-4 whitespace-pre-wrap text-sm leading-6 text-slate-200">{pkg.content}</p>
                  </div>
                  <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-400" />
                </div>

                <div className="mt-4 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                  <span>Job: {pkg.jobId || pkg.id}</span>
                  <span>Nền tảng: {(pkg.platforms || []).join(', ') || 'tự chọn theo kết nối'}</span>
                  <span>Ảnh: {pkg.imageUrl ? 'có' : 'không'}</span>
                  <span>Video: {pkg.videoUrl ? 'có' : 'không'}</span>
                </div>

                <button
                  type="button"
                  onClick={() => importPackage(pkg)}
                  disabled={processingId === pkg.id}
                  className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 font-bold text-slate-950 transition hover:bg-amber-200 disabled:opacity-50"
                >
                  {processingId === pkg.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                  Đưa vào hàng đợi
                </button>
              </article>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default DhpMediaInbox;
