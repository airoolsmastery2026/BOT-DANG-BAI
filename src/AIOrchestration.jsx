import React, { useEffect, useMemo, useState } from 'react';
import {
  Bot, BrainCircuit, CheckCircle2, ChevronRight, ClipboardCheck, FileJson, Gauge, LockKeyhole,
  Play, Plus, RotateCcw, Route, Save, ShieldCheck, UserCheck,
} from 'lucide-react';
import { AI_PRODUCTION_STAGES, AI_ROUTING_RULES } from './ai_production_workflow';
import { AI_AGENT_CONTRACTS, validateAgentOutput } from './ai_agent_contracts';
import { DHP_BRAND_MEMORY } from './brand_memory';
import {
  STAGE_STATUS, approveStage, createProductionRun, getRunProgress, loadProductionRuns,
  requestStageRevision, saveProductionRuns, startStage, submitStageOutput,
} from './ai_production_runs';
import { MASTER_SKILLS, getMasterSkillForStage } from './master_skill_catalog';
import { masterContentSkillRuntime } from './master_content_skill_runtime';

const STATUS_LABELS = {
  locked: 'Đang khóa', ready: 'Sẵn sàng', running: 'Đang thực hiện', review: 'Chờ kiểm tra',
  passed: 'Đã đạt', revision: 'Cần sửa', blocked: 'Bị chặn',
};

const statusClass = (status) => {
  if (status === STAGE_STATUS.PASSED) return 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300';
  if (status === STAGE_STATUS.RUNNING || status === STAGE_STATUS.REVIEW) return 'border-amber-400/30 bg-amber-400/10 text-amber-300';
  if (status === STAGE_STATUS.REVISION || status === STAGE_STATUS.BLOCKED) return 'border-red-400/30 bg-red-400/10 text-red-300';
  if (status === STAGE_STATUS.LOCKED) return 'border-slate-600 bg-slate-800/70 text-slate-500';
  return 'border-sky-400/30 bg-sky-400/10 text-sky-300';
};

const emptyForm = { name: '', topic: '', service: 'Cửa cổng', objective: 'Tăng yêu cầu tư vấn', channels: ['facebook'] };

const AIOrchestration = () => {
  const [runs, setRuns] = useState(loadProductionRuns);
  const [activeRunId, setActiveRunId] = useState(() => loadProductionRuns()[0]?.id || '');
  const [selectedId, setSelectedId] = useState(AI_PRODUCTION_STAGES[0].id);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [jsonDraft, setJsonDraft] = useState('{}');
  const [notice, setNotice] = useState(null);

  useEffect(() => { saveProductionRuns(runs); }, [runs]);

  const activeRun = useMemo(() => runs.find((run) => run.id === activeRunId) || null, [runs, activeRunId]);
  const selected = useMemo(() => AI_PRODUCTION_STAGES.find((stage) => stage.id === selectedId) || AI_PRODUCTION_STAGES[0], [selectedId]);
  const selectedRunStage = activeRun?.stages.find((stage) => stage.id === selected.id) || null;
  const contract = AI_AGENT_CONTRACTS[selected.id] || null;
  const masterSkill = getMasterSkillForStage(selected.id);
  const draftAssessment = useMemo(() => {
    if (!contract) return null;
    try { return validateAgentOutput(selected.id, JSON.parse(jsonDraft)); } catch { return null; }
  }, [contract, jsonDraft, selected.id]);

  useEffect(() => {
    setJsonDraft(selectedRunStage?.output ? JSON.stringify(selectedRunStage.output, null, 2) : '{}');
  }, [activeRunId, selectedId, selectedRunStage?.output]);

  const updateActiveRun = (updater) => {
    setRuns((current) => current.map((run) => run.id === activeRunId ? updater(run) : run));
  };

  const createRun = () => {
    if (!form.topic.trim()) return setNotice({ type: 'error', text: 'Cần nhập chủ đề chiến dịch.' });
    const run = createProductionRun(form);
    setRuns((current) => [run, ...current]);
    setActiveRunId(run.id);
    setSelectedId('strategy');
    setForm(emptyForm);
    setShowCreate(false);
    setNotice({ type: 'success', text: 'Đã tạo quy trình sản xuất AI mới.' });
  };

  const toggleChannel = (channel) => setForm((current) => ({
    ...current,
    channels: current.channels.includes(channel)
      ? current.channels.filter((item) => item !== channel)
      : [...current.channels, channel],
  }));

  const handleStart = () => {
    if (!activeRun || !selectedRunStage) return;
    updateActiveRun((run) => startStage(run, selected.id));
    setNotice({ type: 'success', text: `Đã bắt đầu công đoạn ${selected.name}.` });
  };

  const saveOutput = () => {
    if (!activeRun || !contract) return;
    try {
      const output = JSON.parse(jsonDraft);
      const validation = validateAgentOutput(selected.id, output);
      updateActiveRun((run) => submitStageOutput(run, selected.id, output, validation));
      setNotice({
        type: validation.valid ? 'success' : 'error',
        text: validation.valid
          ? `Master Skill QA đạt ${validation.score}/100 và đã chuyển sang chờ kiểm tra.${validation.warnings.length ? ` Cảnh báo: ${validation.warnings.join(' ')}` : ''}`
          : `Master Skill QA ${validation.score}/100: ${validation.errors.join(' ')}`,
      });
    } catch (error) {
      setNotice({ type: 'error', text: `JSON không hợp lệ: ${error.message}` });
    }
  };

  const approve = () => {
    updateActiveRun((run) => approveStage(run, selected.id));
    const next = AI_PRODUCTION_STAGES.find((stage) => stage.order === selected.order + 1);
    if (next) setSelectedId(next.id);
    setNotice({ type: 'success', text: 'Đã duyệt công đoạn và mở khóa bước tiếp theo.' });
  };

  const revise = () => {
    updateActiveRun((run) => requestStageRevision(run, selected.id, 'Cần chỉnh sửa trước khi chuyển bước.'));
    setNotice({ type: 'error', text: 'Đã trả công đoạn về trạng thái cần sửa.' });
  };

  const instruction = activeRun && contract ? masterContentSkillRuntime.execute({
    stageId: selected.id,
    payload: {
      campaign: { name: activeRun.name, topic: activeRun.topic, service: activeRun.service, objective: activeRun.objective, channels: activeRun.channels },
      previousOutputs: activeRun.stages.filter((stage) => stage.output).map((stage) => ({ stageId: stage.id, output: stage.output })),
    },
  }).instruction : null;

  return (
    <div className="dhp-page px-4 py-6 text-slate-100 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="dhp-hero overflow-hidden rounded-3xl border border-amber-400/20 p-6 md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="dhp-eyebrow">Đại Hải Phát AI Production OS</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-white md:text-5xl">Trung tâm điều phối sản xuất nội dung</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">Prompt, dữ liệu, trạng thái, đầu ra JSON và cổng duyệt được tách riêng để kiểm soát từng công đoạn.</p>
            </div>
            <button type="button" onClick={() => setShowCreate((value) => !value)} className="inline-flex items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-3 font-bold text-slate-950 hover:bg-amber-300"><Plus className="h-4 w-4" /> Tạo chiến dịch</button>
          </div>
        </section>

        {notice && <div className={`rounded-xl border p-4 text-sm ${notice.type === 'success' ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200' : 'border-red-400/30 bg-red-400/10 text-red-200'}`}>{notice.text}</div>}

        {showCreate && (
          <section className="dhp-panel rounded-2xl p-5">
            <h3 className="text-lg font-bold text-white">Khởi tạo quy trình sản xuất</h3>
            <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-4">
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Tên chiến dịch" className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2" />
              <input value={form.topic} onChange={(e) => setForm({ ...form, topic: e.target.value })} placeholder="Chủ đề bắt buộc" className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2" />
              <input value={form.service} onChange={(e) => setForm({ ...form, service: e.target.value })} placeholder="Dịch vụ" className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2" />
              <input value={form.objective} onChange={(e) => setForm({ ...form, objective: e.target.value })} placeholder="Mục tiêu" className="rounded-xl border border-white/10 bg-slate-950/40 px-3 py-2" />
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              {['facebook', 'instagram', 'tiktok', 'youtube', 'pinterest', 'zalo', 'linkedin'].map((channel) => (
                <button key={channel} type="button" onClick={() => toggleChannel(channel)} className={`rounded-full border px-3 py-1.5 text-xs font-semibold ${form.channels.includes(channel) ? 'border-amber-400/40 bg-amber-400/10 text-amber-300' : 'border-white/10 text-slate-400'}`}>{channel}</button>
              ))}
            </div>
            <button type="button" onClick={createRun} className="mt-4 rounded-xl bg-amber-400 px-4 py-2 font-bold text-slate-950">Tạo quy trình</button>
          </section>
        )}

        <section className="dhp-panel rounded-2xl p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex min-w-0 flex-1 gap-3 overflow-x-auto pb-1">
              {runs.map((run) => (
                <button key={run.id} type="button" onClick={() => { setActiveRunId(run.id); setSelectedId(run.currentStageId); }} className={`min-w-[220px] rounded-xl border p-3 text-left ${run.id === activeRunId ? 'border-amber-400/40 bg-amber-400/10' : 'border-white/10 bg-white/[0.02]'}`}>
                  <p className="truncate text-sm font-bold text-white">{run.name}</p>
                  <p className="mt-1 truncate text-xs text-slate-400">{run.topic}</p>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-800"><div className="h-full bg-amber-400" style={{ width: `${getRunProgress(run)}%` }} /></div>
                  <p className="mt-1 text-xs text-slate-500">{getRunProgress(run)}% hoàn thành</p>
                </button>
              ))}
              {runs.length === 0 && <p className="p-4 text-sm text-slate-400">Chưa có chiến dịch. Tạo chiến dịch để bắt đầu.</p>}
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="dhp-panel rounded-2xl p-3">
            <div className="mb-3 flex items-center gap-2 px-3 py-2 text-sm font-semibold text-amber-300"><Route className="h-4 w-4" /> Chuỗi sản xuất</div>
            <div className="space-y-1">
              {AI_PRODUCTION_STAGES.map((stage) => {
                const runStage = activeRun?.stages.find((item) => item.id === stage.id);
                return (
                  <button key={stage.id} type="button" onClick={() => setSelectedId(stage.id)} className={`w-full rounded-xl px-3 py-3 text-left transition ${selectedId === stage.id ? 'dhp-stage-active' : 'text-slate-300 hover:bg-white/5'}`}>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-xs font-bold text-amber-300">{stage.order}</span>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{stage.name}</p><p className="mt-0.5 truncate text-xs text-slate-500">{stage.agent}</p></div>
                      {runStage?.status === STAGE_STATUS.LOCKED ? <LockKeyhole className="h-4 w-4 text-slate-600" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                    {runStage && <span className={`mt-2 inline-flex rounded-full border px-2 py-0.5 text-[11px] ${statusClass(runStage.status)}`}>{STATUS_LABELS[runStage.status]}</span>}
                  </button>
                );
              })}
            </div>
          </aside>

          <section className="space-y-5">
            <div className="dhp-panel rounded-2xl p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Công đoạn {selected.order}</p><h3 className="mt-2 text-2xl font-bold text-white">{selected.name}</h3><p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-300"><Bot className="h-4 w-4 text-amber-300" /> {selected.agent}</p></div>
                <span className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300"><ShieldCheck className="h-4 w-4" /> Có cổng kiểm soát</span>
              </div>
              <p className="mt-5 border-l-2 border-amber-400/50 pl-4 leading-7 text-slate-300">{selected.purpose}</p>
            </div>

            {contract && (
              <div className="grid gap-5 xl:grid-cols-2">
                <div className="dhp-panel rounded-2xl p-5">
                  <h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-slate-400"><ClipboardCheck className="h-4 w-4" /> Prompt và hợp đồng</h4>
                  {masterSkill && <div className="mt-4 rounded-xl border border-violet-400/20 bg-violet-400/5 p-4"><p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.14em] text-violet-300"><BrainCircuit className="h-4 w-4" /> {masterSkill.name} · v{masterSkill.version}</p><p className="mt-2 text-sm leading-6 text-slate-300">{masterSkill.summary}</p><div className="mt-3 space-y-1.5">{masterSkill.qualityGates.map((gate) => <p key={gate} className="flex gap-2 text-xs text-violet-100"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-violet-300" />{gate}</p>)}</div></div>}
                  <p className="mt-4 text-sm leading-6 text-slate-300">{contract.systemPrompt}</p>
                  <p className="mt-4 text-xs font-bold text-amber-300">Đầu vào bắt buộc</p>
                  <div className="mt-2 flex flex-wrap gap-2">{contract.requiredInputs.map((item) => <span key={item} className="rounded-full border border-white/10 px-2.5 py-1 text-xs text-slate-300">{item}</span>)}</div>
                  <details className="mt-4 rounded-xl border border-white/10 bg-slate-950/30 p-3"><summary className="cursor-pointer text-sm font-semibold text-slate-300">Xem instruction đầy đủ</summary><pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap text-xs text-slate-400">{JSON.stringify(instruction, null, 2)}</pre></details>
                </div>

                <div className="dhp-panel rounded-2xl p-5">
                  <div className="flex items-center justify-between gap-3"><h4 className="flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-slate-400"><FileJson className="h-4 w-4" /> Đầu ra JSON</h4>{draftAssessment && <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-bold ${draftAssessment.valid ? 'border-emerald-400/30 bg-emerald-400/10 text-emerald-300' : 'border-amber-400/30 bg-amber-400/10 text-amber-300'}`}><Gauge className="h-3.5 w-3.5" /> QA {draftAssessment.score}/100</span>}</div>
                  <textarea value={jsonDraft} onChange={(e) => setJsonDraft(e.target.value)} rows="16" disabled={!activeRun || selectedRunStage?.status === STAGE_STATUS.LOCKED} className="mt-4 w-full rounded-xl border border-white/10 bg-slate-950/50 p-3 font-mono text-xs text-slate-200 disabled:opacity-40" />
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button type="button" onClick={handleStart} disabled={!activeRun || ![STAGE_STATUS.READY, STAGE_STATUS.REVISION].includes(selectedRunStage?.status)} className="inline-flex items-center gap-2 rounded-lg bg-sky-500 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-40"><Play className="h-4 w-4" /> Bắt đầu</button>
                    <button type="button" onClick={saveOutput} disabled={!activeRun || ![STAGE_STATUS.RUNNING, STAGE_STATUS.REVISION, STAGE_STATUS.BLOCKED].includes(selectedRunStage?.status)} className="inline-flex items-center gap-2 rounded-lg bg-amber-400 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-40"><Save className="h-4 w-4" /> Lưu & kiểm tra</button>
                    <button type="button" onClick={approve} disabled={selectedRunStage?.status !== STAGE_STATUS.REVIEW} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-sm font-bold text-slate-950 disabled:opacity-40"><CheckCircle2 className="h-4 w-4" /> Duyệt bước</button>
                    <button type="button" onClick={revise} disabled={![STAGE_STATUS.REVIEW, STAGE_STATUS.PASSED].includes(selectedRunStage?.status)} className="inline-flex items-center gap-2 rounded-lg border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm font-bold text-red-300 disabled:opacity-40"><RotateCcw className="h-4 w-4" /> Yêu cầu sửa</button>
                  </div>
                </div>
              </div>
            )}

            <div className="grid gap-5 md:grid-cols-2">
              <div className="dhp-panel rounded-2xl p-5"><h4 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-400">Đầu vào nghiệp vụ</h4><div className="mt-4 space-y-3">{selected.inputs.map((item) => <p key={item} className="flex gap-2 text-sm text-slate-300"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber-400" />{item}</p>)}</div></div>
              <div className="dhp-panel rounded-2xl p-5"><h4 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-400">Đầu ra tiêu chuẩn</h4><div className="mt-4 space-y-3">{selected.outputs.map((item) => <p key={item} className="flex gap-2 text-sm text-slate-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />{item}</p>)}</div></div>
            </div>

            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5"><p className="flex items-center gap-2 text-sm font-bold text-amber-300"><UserCheck className="h-5 w-5" /> Điều kiện chuyển công đoạn</p><p className="mt-2 text-sm leading-6 text-slate-300">{selected.gate}</p></div>
          </section>
        </div>

        <section className="grid gap-5 lg:grid-cols-2">
          <div className="dhp-panel rounded-2xl p-6"><h3 className="text-xl font-bold text-white">Bộ nhớ thương hiệu đang áp dụng</h3><p className="mt-3 text-sm leading-6 text-slate-300">{DHP_BRAND_MEMORY.brand.positioning}</p><div className="mt-4 flex flex-wrap gap-2">{DHP_BRAND_MEMORY.brand.tone.map((tone) => <span key={tone} className="rounded-full border border-amber-400/20 bg-amber-400/5 px-3 py-1 text-xs text-amber-200">{tone}</span>)}</div></div>
          <div className="dhp-panel rounded-2xl p-6"><h3 className="text-xl font-bold text-white">Quy tắc điều phối chung</h3><div className="mt-4 space-y-3">{AI_ROUTING_RULES.principles.map((rule, index) => <div key={rule} className="flex gap-3 text-sm leading-6 text-slate-300"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 font-bold text-amber-300">{index + 1}</span>{rule}</div>)}</div></div>
        </section>

        <section className="dhp-panel rounded-2xl p-6">
          <div className="flex items-start gap-3"><BrainCircuit className="mt-1 h-6 w-6 text-violet-300" /><div><h3 className="text-xl font-bold text-white">DHP Master Skill Pack</h3><p className="mt-1 text-sm text-slate-400">{MASTER_SKILLS.length} skill có version, quality gate và kiểm định JSON; đây là instruction engineering có kiểm soát, không giả mạo fine-tuning mô hình.</p></div></div>
          <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">{MASTER_SKILLS.map((skill) => <article key={skill.id} className="rounded-xl border border-white/10 bg-slate-950/30 p-4"><p className="text-sm font-bold text-violet-200">{skill.name}</p><p className="mt-1 text-[11px] text-slate-500">{skill.id} · v{skill.version}</p><p className="mt-3 text-xs leading-5 text-slate-300">{skill.summary}</p></article>)}</div>
        </section>
      </div>
    </div>
  );
};

export default AIOrchestration;
