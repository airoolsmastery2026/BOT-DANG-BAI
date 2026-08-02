import React, { useMemo, useState } from 'react';
import { CalendarClock, CheckCircle, Image, Save, Sparkles, Video } from 'lucide-react';
import { buildCampaignWorkflow, validateWorkflowForScheduling } from './campaign_workflow';
import { loadCampaignWorkflows, saveCampaignWorkflow } from './campaign_storage';

const PLATFORM_OPTIONS = [
  ['facebook', 'Facebook'],
  ['instagram', 'Instagram'],
  ['tiktok', 'TikTok'],
  ['youtube', 'YouTube'],
  ['pinterest', 'Pinterest'],
  ['linkedin', 'LinkedIn'],
  ['zalo', 'Zalo OA'],
];

const CampaignStudio = () => {
  const [topic, setTopic] = useState('');
  const [platforms, setPlatforms] = useState(['facebook']);
  const [mediaTypes, setMediaTypes] = useState(['image']);
  const [publishAt, setPublishAt] = useState('');
  const [workflow, setWorkflow] = useState(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [savedCount, setSavedCount] = useState(() => loadCampaignWorkflows().length);

  const validation = useMemo(
    () => (workflow ? validateWorkflowForScheduling(workflow) : null),
    [workflow],
  );

  const toggleValue = (value, values, setter) => {
    setter(values.includes(value) ? values.filter((item) => item !== value) : [...values, value]);
    setSuccess('');
  };

  const generateWorkflow = () => {
    try {
      const nextWorkflow = buildCampaignWorkflow({
        topic,
        platforms,
        mediaTypes,
        publishAt: publishAt ? new Date(publishAt).toISOString() : null,
        approvalMode: 'review',
        goal: 'lead_generation',
        tone: 'professional',
      });
      setWorkflow(nextWorkflow);
      setError('');
      setSuccess('Workflow đã được tạo. Hãy kiểm tra và lưu bản nháp.');
    } catch (nextError) {
      setWorkflow(null);
      setSuccess('');
      setError(nextError.message || 'Không thể tạo workflow.');
    }
  };

  const saveDraft = () => {
    try {
      if (!workflow) throw new Error('Chưa có workflow để lưu.');
      saveCampaignWorkflow(workflow);
      setSavedCount(loadCampaignWorkflows().length);
      setError('');
      setSuccess('Đã lưu workflow vào danh sách bản nháp trên thiết bị này.');
    } catch (nextError) {
      setSuccess('');
      setError(nextError.message || 'Không thể lưu workflow.');
    }
  };

  return (
    <section className="text-white p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-purple-300">AI Content Studio</p>
          <h2 className="mt-2 text-3xl md:text-4xl font-bold">Tạo chiến dịch bằng một câu lệnh</h2>
          <p className="mt-2 max-w-3xl text-gray-300">
            Nhập chủ đề, chọn nền tảng và loại nội dung. Hệ thống tạo workflow ảnh/video theo đúng tỷ lệ từng kênh trước khi đưa vào hàng đợi.
          </p>
          <p className="mt-2 text-sm text-gray-400">Bản nháp đã lưu trên thiết bị: {savedCount}</p>
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="rounded-2xl border border-white/10 bg-gray-900/70 p-5 shadow-xl">
            <label className="block text-sm font-semibold text-gray-200" htmlFor="campaign-topic">
              Câu lệnh hoặc chủ đề chiến dịch
            </label>
            <textarea
              id="campaign-topic"
              value={topic}
              onChange={(event) => { setTopic(event.target.value); setSuccess(''); }}
              rows={5}
              maxLength={2000}
              placeholder="Ví dụ: Tạo chiến dịch 7 ngày quảng bá tủ bếp veneer cho khách hàng tại TP.HCM."
              className="mt-2 w-full rounded-xl border border-white/10 bg-slate-950/70 px-4 py-3 text-white outline-none transition focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20"
            />
            <p className="mt-1 text-right text-xs text-gray-500">{topic.length}/2000</p>

            <fieldset className="mt-6">
              <legend className="text-sm font-semibold text-gray-200">Nền tảng</legend>
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
              <legend className="text-sm font-semibold text-gray-200">Loại nội dung</legend>
              <div className="mt-3 grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => toggleValue('image', mediaTypes, setMediaTypes)}
                  aria-pressed={mediaTypes.includes('image')}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 ${mediaTypes.includes('image') ? 'border-purple-400 bg-purple-500/20' : 'border-white/10 bg-white/5'}`}
                >
                  <Image className="h-4 w-4" aria-hidden="true" /> Ảnh
                </button>
                <button
                  type="button"
                  onClick={() => toggleValue('video', mediaTypes, setMediaTypes)}
                  aria-pressed={mediaTypes.includes('video')}
                  className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 ${mediaTypes.includes('video') ? 'border-purple-400 bg-purple-500/20' : 'border-white/10 bg-white/5'}`}
                >
                  <Video className="h-4 w-4" aria-hidden="true" /> Video
                </button>
              </div>
            </fieldset>

            <label className="mt-6 block text-sm font-semibold text-gray-200" htmlFor="campaign-publish-at">
              Thời gian đăng dự kiến
            </label>
            <div className="relative mt-2">
              <CalendarClock className="pointer-events-none absolute left-3 top-3 h-5 w-5 text-gray-400" aria-hidden="true" />
              <input
                id="campaign-publish-at"
                type="datetime-local"
                value={publishAt}
                onChange={(event) => { setPublishAt(event.target.value); setSuccess(''); }}
                className="w-full rounded-xl border border-white/10 bg-slate-950/70 py-3 pl-11 pr-4 text-white outline-none focus:border-purple-400 focus:ring-2 focus:ring-purple-400/20"
              />
            </div>

            <div aria-live="polite">
              {error && <p className="mt-4 rounded-lg bg-red-500/10 px-3 py-2 text-sm text-red-300">{error}</p>}
              {success && <p className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-500/10 px-3 py-2 text-sm text-emerald-300"><CheckCircle className="h-4 w-4" />{success}</p>}
            </div>

            <button
              type="button"
              onClick={generateWorkflow}
              className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-purple-500 px-5 py-3 font-semibold text-white transition hover:bg-purple-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-purple-300"
            >
              <Sparkles className="h-5 w-5" aria-hidden="true" /> Tạo workflow
            </button>
          </div>

          <div className="rounded-2xl border border-white/10 bg-gray-900/70 p-5 shadow-xl">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-lg font-bold">Bản xem trước workflow</h3>
              <button
                type="button"
                onClick={saveDraft}
                disabled={!workflow}
                className="flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold transition hover:bg-white/20 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Save className="h-4 w-4" /> Lưu bản nháp
              </button>
            </div>
            {!workflow ? (
              <div className="mt-4 flex min-h-[420px] items-center justify-center rounded-xl border border-dashed border-white/10 bg-slate-950/40 p-8 text-center text-gray-400">
                Workflow ảnh và video sẽ xuất hiện tại đây.
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-4">
                  <div className="rounded-xl bg-white/5 p-3"><span className="block text-gray-400">Kênh</span><strong>{workflow.channels.length}</strong></div>
                  <div className="rounded-xl bg-white/5 p-3"><span className="block text-gray-400">Media</span><strong>{workflow.channels.reduce((sum, channel) => sum + channel.jobs.length, 0)}</strong></div>
                  <div className="rounded-xl bg-white/5 p-3"><span className="block text-gray-400">Trạng thái</span><strong>{workflow.workflowStatus}</strong></div>
                  <div className="rounded-xl bg-white/5 p-3"><span className="block text-gray-400">Lịch</span><strong>{validation?.valid ? 'Sẵn sàng' : 'Chưa đủ'}</strong></div>
                </div>

                <div className="max-h-[500px] space-y-3 overflow-y-auto pr-1">
                  {workflow.channels.map((channel) => (
                    <article key={channel.platform} className="rounded-xl border border-white/10 bg-slate-950/50 p-4">
                      <h4 className="font-semibold capitalize">{channel.platform}</h4>
                      <div className="mt-3 space-y-2">
                        {channel.jobs.map((job) => (
                          <div key={job.idempotencyKey} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2 text-sm">
                            <span className="flex items-center gap-2">
                              {job.type === 'image' ? <Image className="h-4 w-4" /> : <Video className="h-4 w-4" />}
                              {job.type === 'image' ? 'Ảnh' : 'Video'} · {job.templateId}
                            </span>
                            <span className="text-gray-400">{job.output.width}×{job.output.height}</span>
                          </div>
                        ))}
                      </div>
                    </article>
                  ))}
                </div>

                {validation && !validation.valid && (
                  <div className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">
                    {validation.errors.join(' ')}
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
