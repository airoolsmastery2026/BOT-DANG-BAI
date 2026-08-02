import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  CheckCircle2,
  Circle,
  Image,
  Loader2,
  Play,
  Save,
  Video,
  XCircle,
} from 'lucide-react';
import { loadCampaignWorkflows, saveCampaignWorkflow } from './campaign_storage';
import { executeCampaignRun } from './campaign_orchestrator';

const PLATFORM_OPTIONS = [
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['tiktok', 'TikTok'],
  ['youtube', 'YouTube'],
  ['pinterest', 'Pinterest'],
  ['linkedin', 'LinkedIn'],
  ['zalo', 'Zalo OA'],
];

const STEP_ICONS = {
  pending: Circle,
  running: Loader2,
  completed: CheckCircle2,
  failed: XCircle,
};

const CampaignStudio = () => {
  const [command, setCommand] = useState('');
  const [platforms, setPlatforms] = useState([]);
  const [mediaTypes, setMediaTypes] = useState([]);
  const [publishAt, setPublishAt] = useState('');
  const [mode, setMode] = useState('review');
  const [run, setRun] = useState(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savedCount, setSavedCount] = useState(() => loadCampaignWorkflows().length);

  const workflow = run?.workflow || null;
  const mediaCount = useMemo(
    () => workflow?.channels?.reduce((sum, channel) => sum + channel.jobs.length, 0) || 0,
    [workflow],
  );

  const toggleValue = (value, values, setter) => {
    setter(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
    setSuccess('');
  };

  const runCampaign = async () => {
    setRunning(true);
    setError('');
    setSuccess('');
    setRun(null);

    try {
      const result = await executeCampaignRun(command, {
        platforms: platforms.length ? platforms : undefined,
        mediaTypes: mediaTypes.length ? mediaTypes : undefined,
        publishAt: publishAt ? new Date(publishAt).toISOString() : null,
        mode,
      }, setRun);

      setRun(result);
      setSavedCount(loadCampaignWorkflows().length);
      setSuccess(
        result.status === 'ready'
          ? 'Chiến dịch đã sẵn sàng để đưa vào lịch đăng.'
          : 'Chiến dịch đã được tạo và lưu để duyệt trước khi đăng.',
      );
    } catch (nextError) {
      if (nextError.campaignRun) setRun(nextError.campaignRun);
      setError(nextError.message || 'Không thể chạy toàn bộ chiến dịch.');
    } finally {
      setRunning(false);
    }
  };

  const saveAgain = () => {
    try {
      if (!workflow) throw new Error('Chưa có workflow để lưu.');
      saveCampaignWorkflow(workflow);
      setSavedCount(loadCampaignWorkflows().length);
      setSuccess('Đã cập nhật bản nháp chiến dịch.');
      setError('');
    } catch (nextError) {
      setError(nextError.message || 'Không thể lưu workflow.');
    }
  };

  return (
    <section className="p-4 text-white md:p-8">
      <div className="mx-auto max-w-7xl">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">One-Click Campaign Automation</p>
          <h2 className="mt-2 text-3xl font-bold md:text-4xl">Một câu lệnh, chạy toàn bộ quy trình</h2>
          <p className="mt-2 max-w-3xl text-gray-300">
            Hệ thống tự phân tích yêu cầu, lập workflow, chuẩn bị nội dung và media, kiểm tra điều kiện rồi lưu chiến dịch để duyệt hoặc tự động hóa.
          </p>
          <p className="mt-2 text-sm text-gray-400">Bản nháp trên thiết bị: {savedCount}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <div className="rounded-2xl border border-white/10 bg-gray-900/70 p-5 shadow-xl">
            <label className="block text-sm font-semibold text-gray-200" htmlFor="campaign-command">
              Câu lệnh chiến dịch
            </label>
            <textarea
              id="campaign-command"
              value={command}
              onChange={(event) => setCommand(event.target.value)}
              rows={6}
              maxLength={2000}
              placeholder="Ví dụ: Tạo chiến dịch 7 ngày quảng bá tủ bếp veneer, đăng Facebook và TikTok, tạo ảnh và video, lúc 19:30 mỗi ngày."
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20"
            />
            <p className="mt-1 text-right text-xs text-gray-500">{command.length}/2000</p>

            <fieldset className="mt-6">
              <legend className="text-sm font-semibold text-gray-200">Ghi đè nền tảng (không chọn = AI tự suy luận)</legend>
              <div className="mt-3 flex flex-wrap gap-2">
                {PLATFORM_OPTIONS.map(([value, label]) => {
                  const selected = platforms.includes(value);
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => toggleValue(value, platforms, setPlatforms)}
                      aria-pressed={selected}
                      className={`rounded-full px-3 py-2 text-sm transition ${selected ? 'bg-purple-500 text-white' : 'bg-white/5 text-gray-300 hover:bg-white/10'}`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="mt-6">
              <legend className="text-sm font-semibold text-gray-200">Ghi đè loại nội dung</legend>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {[
                  ['image', 'Ảnh', Image],
                  ['video', 'Video', Video],
                ].map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => toggleValue(value, mediaTypes, setMediaTypes)}
                    aria-pressed={mediaTypes.includes(value)}
                    className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 ${mediaTypes.includes(value) ? 'border-purple-400 bg-purple-500/20' : 'border-white/10 bg-white/5'}`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" /> {label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label className="mt-6 block text-sm font-semibold text-gray-200" htmlFor="campaign-publish-at">
              Thời gian đăng đầu tiên
            </label>
            <div className="relative mt-2">
              <CalendarClock className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-gray-400" aria-hidden="true" />
              <input
                id="campaign-publish-at"
                type="datetime-local"
                value={publishAt}
                onChange={(event) => setPublishAt(event.target.value)}
                className="w-full rounded-xl border border-white/10 bg-slate-950/70 py-3 pl-11 pr-4 text-white outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20"
              />
            </div>

            <fieldset className="mt-6">
              <legend className="text-sm font-semibold text-gray-200">Chế độ vận hành</legend>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setMode('review')} className={`rounded-xl border px-3 py-3 text-sm ${mode === 'review' ? 'border-purple-400 bg-purple-500/20' : 'border-white/10 bg-white/5'}`}>Duyệt trước</button>
                <button type="button" onClick={() => setMode('automatic')} className={`rounded-xl border px-3 py-3 text-sm ${mode === 'automatic' ? 'border-emerald-400 bg-emerald-500/20' : 'border-white/10 bg-white/5'}`}>Tự động</button>
              </div>
            </fieldset>

            <div aria-live="polite">
              {error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
              {success && <p className="mt-4 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300">{success}</p>}
            </div>

            <button
              type="button"
              onClick={runCampaign}
              disabled={running || !command.trim()}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-500 px-5 py-3 font-semibold text-white transition hover:bg-purple-400 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {running ? <Loader2 className="h-5 w-5 animate-spin" /> : <Play className="h-5 w-5" />}
              {running ? 'Đang chạy chiến dịch...' : 'Chạy toàn bộ chiến dịch'}
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-gray-900/70 p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold">Tiến trình One-Click</h3>
              <button type="button" onClick={saveAgain} disabled={!workflow} className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold hover:bg-white/20 disabled:opacity-40">
                <Save className="h-4 w-4" /> Lưu lại
              </button>
            </div>

            {!run ? (
              <div className="mt-4 flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/40 p-8 text-center text-gray-400">
                Tiến trình phân tích, lập kế hoạch, chuẩn bị media và kiểm tra chiến dịch sẽ xuất hiện tại đây.
              </div>
            ) : (
              <div className="mt-5 space-y-5">
                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <div className="rounded-xl bg-white/5 p-3"><span className="block text-gray-400">Run ID</span><strong className="break-all text-xs">{run.runId}</strong></div>
                  <div className="rounded-xl bg-white/5 p-3"><span className="block text-gray-400">Trạng thái</span><strong>{run.status}</strong></div>
                  <div className="rounded-xl bg-white/5 p-3"><span className="block text-gray-400">Kênh</span><strong>{workflow?.channels?.length || 0}</strong></div>
                  <div className="rounded-xl bg-white/5 p-3"><span className="block text-gray-400">Media</span><strong>{mediaCount}</strong></div>
                </div>

                <div className="space-y-2">
                  {run.steps.map((step) => {
                    const Icon = STEP_ICONS[step.status] || Circle;
                    return (
                      <div key={step.id} className="flex items-center gap-3 rounded-xl border border-white/10 bg-slate-950/50 px-4 py-3">
                        <Icon className={`h-5 w-5 ${step.status === 'running' ? 'animate-spin text-purple-300' : step.status === 'completed' ? 'text-emerald-300' : step.status === 'failed' ? 'text-red-300' : 'text-gray-500'}`} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium">{step.label}</p>
                          {step.error && <p className="text-xs text-red-300">{step.error}</p>}
                        </div>
                        <span className="text-xs uppercase text-gray-500">{step.status}</span>
                      </div>
                    );
                  })}
                </div>

                {workflow && (
                  <div className="max-h-[300px] space-y-3 overflow-y-auto pr-1">
                    {workflow.channels.map((channel) => (
                      <article key={channel.platform} className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                        <h4 className="font-semibold capitalize">{channel.platform}</h4>
                        <p className="mt-1 text-xs text-gray-400">{channel.jobs.length} tác vụ · {channel.contentStatus}</p>
                      </article>
                    ))}
                  </div>
                )}

                {run.readiness && (
                  <div className={`rounded-xl p-3 text-sm ${run.readiness.ready ? 'bg-emerald-500/10 text-emerald-200' : 'bg-amber-500/10 text-amber-200'}`}>
                    {run.readiness.ready
                      ? 'Workflow đã vượt qua toàn bộ kiểm tra.'
                      : [...run.readiness.errors, ...run.readiness.warnings].join(' ') || 'Workflow đang chờ duyệt.'}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
  );
};

export default CampaignStudio;
