import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock3, FileText, RefreshCw, Send, Trash2 } from 'lucide-react';
import {
  loadCampaignWorkflows,
  removeCampaignWorkflow,
  saveCampaignWorkflow,
} from './campaign_storage';
import { validateWorkflowForScheduling } from './campaign_workflow';

const STATUS_LABELS = {
  draft: 'Bản nháp',
  awaiting_review: 'Chờ duyệt',
  approved: 'Đã duyệt',
  scheduled: 'Đã lên lịch',
};

const formatDateTime = (value) => {
  if (!value) return 'Chưa đặt lịch';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Thời gian không hợp lệ' : date.toLocaleString('vi-VN');
};

const CampaignDrafts = ({ onNavigate }) => {
  const [workflows, setWorkflows] = useState([]);
  const [notice, setNotice] = useState(null);

  const refresh = () => {
    setWorkflows(loadCampaignWorkflows());
  };

  useEffect(() => {
    refresh();
  }, []);

  const stats = useMemo(() => ({
    total: workflows.length,
    approved: workflows.filter((item) => item.workflowStatus === 'approved').length,
    waiting: workflows.filter((item) => ['draft', 'awaiting_review'].includes(item.workflowStatus)).length,
  }), [workflows]);

  const updateStatus = (workflow, workflowStatus) => {
    try {
      saveCampaignWorkflow({ ...workflow, workflowStatus });
      refresh();
      setNotice({ type: 'success', message: workflowStatus === 'approved' ? 'Đã duyệt chiến dịch.' : 'Đã chuyển chiến dịch về bản nháp.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'Không thể cập nhật chiến dịch.' });
    }
  };

  const handleDelete = (workflow) => {
    const name = workflow.campaign?.topic || workflow.campaign?.id;
    if (!window.confirm(`Xóa chiến dịch “${name}”? Thao tác này không thể hoàn tác.`)) return;

    try {
      removeCampaignWorkflow(workflow.campaign.id);
      refresh();
      setNotice({ type: 'success', message: 'Đã xóa chiến dịch.' });
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'Không thể xóa chiến dịch.' });
    }
  };

  const handleOpenScheduler = (workflow) => {
    const validation = validateWorkflowForScheduling(workflow);
    if (!validation.valid) {
      setNotice({ type: 'error', message: validation.errors.join(' ') });
      return;
    }
    if (workflow.workflowStatus !== 'approved') {
      setNotice({ type: 'error', message: 'Chiến dịch cần được duyệt trước khi chuyển sang lịch đăng.' });
      return;
    }

    try {
      localStorage.setItem('bot_dang_bai_scheduler_handoff', JSON.stringify({
        campaignId: workflow.campaign.id,
        topic: workflow.campaign.topic,
        platforms: workflow.channels.map((channel) => channel.platform),
        publishAt: workflow.channels[0]?.jobs?.[0]?.publishAt || null,
        workflow,
        createdAt: new Date().toISOString(),
      }));
      setNotice({ type: 'success', message: 'Đã chuẩn bị dữ liệu cho trình lên lịch.' });
      onNavigate?.('scheduler');
    } catch (error) {
      setNotice({ type: 'error', message: error.message || 'Không thể chuyển dữ liệu sang trình lên lịch.' });
    }
  };

  return (
    <section className="p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">Campaign Review</p>
            <h2 className="mt-2 text-3xl font-bold md:text-4xl">Bản nháp chiến dịch</h2>
            <p className="mt-2 text-gray-300">Kiểm tra, phê duyệt và chuyển workflow sang trình lên lịch.</p>
          </div>
          <button type="button" onClick={refresh} className="inline-flex items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10">
            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Làm mới
          </button>
        </div>

        <div className="mt-6 grid gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-white/10 bg-white/5 p-4"><span className="text-sm text-gray-400">Tổng chiến dịch</span><strong className="mt-1 block text-2xl">{stats.total}</strong></div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4"><span className="text-sm text-gray-400">Chờ duyệt</span><strong className="mt-1 block text-2xl">{stats.waiting}</strong></div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-4"><span className="text-sm text-gray-400">Đã duyệt</span><strong className="mt-1 block text-2xl">{stats.approved}</strong></div>
        </div>

        {notice && (
          <div role="status" className={`mt-5 rounded-xl px-4 py-3 text-sm ${notice.type === 'error' ? 'bg-red-500/10 text-red-200' : 'bg-emerald-500/10 text-emerald-200'}`}>
            {notice.message}
          </div>
        )}

        {workflows.length === 0 ? (
          <div className="mt-6 rounded-2xl border border-dashed border-white/10 bg-slate-950/30 p-10 text-center text-gray-400">
            <FileText className="mx-auto mb-3 h-9 w-9" aria-hidden="true" />
            Chưa có bản nháp. Hãy tạo workflow trong AI Studio.
          </div>
        ) : (
          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            {workflows.map((workflow) => {
              const validation = validateWorkflowForScheduling(workflow);
              const jobs = workflow.channels.reduce((sum, channel) => sum + (channel.jobs?.length || 0), 0);
              const publishAt = workflow.channels[0]?.jobs?.[0]?.publishAt;
              return (
                <article key={workflow.campaign.id} className="rounded-2xl border border-white/10 bg-gray-900/70 p-5 shadow-xl">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-xs uppercase tracking-wider text-purple-300">{STATUS_LABELS[workflow.workflowStatus] || workflow.workflowStatus}</p>
                      <h3 className="mt-1 break-words text-xl font-bold">{workflow.campaign.topic}</h3>
                    </div>
                    <button type="button" onClick={() => handleDelete(workflow)} aria-label="Xóa chiến dịch" className="rounded-lg p-2 text-gray-400 hover:bg-red-500/10 hover:text-red-300">
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>

                  <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
                    <div className="rounded-lg bg-white/5 p-3"><span className="block text-gray-400">Nền tảng</span><strong>{workflow.channels.length}</strong></div>
                    <div className="rounded-lg bg-white/5 p-3"><span className="block text-gray-400">Media jobs</span><strong>{jobs}</strong></div>
                  </div>

                  <div className="mt-4 flex items-center gap-2 text-sm text-gray-300">
                    <Clock3 className="h-4 w-4" aria-hidden="true" /> {formatDateTime(publishAt)}
                  </div>

                  {!validation.valid && <p className="mt-3 text-sm text-amber-200">{validation.errors.join(' ')}</p>}

                  <div className="mt-5 flex flex-wrap gap-2">
                    {workflow.workflowStatus === 'approved' ? (
                      <button type="button" onClick={() => updateStatus(workflow, 'draft')} className="rounded-lg border border-white/10 px-3 py-2 text-sm hover:bg-white/10">Hoàn tác duyệt</button>
                    ) : (
                      <button type="button" onClick={() => updateStatus(workflow, 'approved')} className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold hover:bg-emerald-500">
                        <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Duyệt
                      </button>
                    )}
                    <button type="button" onClick={() => handleOpenScheduler(workflow)} className="inline-flex items-center gap-2 rounded-lg bg-purple-600 px-3 py-2 text-sm font-semibold hover:bg-purple-500">
                      <Send className="h-4 w-4" aria-hidden="true" /> Chuyển sang lịch đăng
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
};

export default CampaignDrafts;
