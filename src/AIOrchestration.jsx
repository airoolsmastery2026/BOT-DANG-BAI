import React, { useMemo, useState } from 'react';
import { Bot, CheckCircle2, ChevronRight, Route, ShieldCheck, UserCheck } from 'lucide-react';
import { AI_PRODUCTION_STAGES, AI_ROUTING_RULES } from './ai_production_workflow';

const AIOrchestration = () => {
  const [selectedId, setSelectedId] = useState(AI_PRODUCTION_STAGES[0].id);
  const selected = useMemo(
    () => AI_PRODUCTION_STAGES.find((stage) => stage.id === selectedId) || AI_PRODUCTION_STAGES[0],
    [selectedId],
  );

  return (
    <div className="dhp-page px-4 py-6 text-slate-100 md:px-8 md:py-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <section className="dhp-hero overflow-hidden rounded-3xl border border-amber-400/20 p-6 md:p-8">
          <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-3xl">
              <p className="dhp-eyebrow">Đại Hải Phát AI Production OS</p>
              <h2 className="mt-3 text-3xl font-bold tracking-tight text-white md:text-5xl">Điều phối AI theo từng hạng mục sản xuất</h2>
              <p className="mt-4 max-w-2xl text-sm leading-7 text-slate-300 md:text-base">
                Mỗi AI có một trách nhiệm, đầu vào, đầu ra và cổng kiểm soát riêng. Nội dung chỉ được xuất bản sau khi đạt QA và được con người phê duyệt.
              </p>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="dhp-stat"><strong>{AI_PRODUCTION_STAGES.length}</strong><span>Công đoạn</span></div>
              <div className="dhp-stat"><strong>2</strong><span>Lớp kiểm soát</span></div>
              <div className="dhp-stat"><strong>100%</strong><span>Cần duyệt</span></div>
            </div>
          </div>
        </section>

        <div className="grid gap-6 lg:grid-cols-[340px_minmax(0,1fr)]">
          <aside className="dhp-panel rounded-2xl p-3">
            <div className="mb-3 flex items-center gap-2 px-3 py-2 text-sm font-semibold text-amber-300">
              <Route className="h-4 w-4" /> Chuỗi sản xuất
            </div>
            <div className="space-y-1">
              {AI_PRODUCTION_STAGES.map((stage) => (
                <button
                  key={stage.id}
                  type="button"
                  onClick={() => setSelectedId(stage.id)}
                  className={`w-full rounded-xl px-3 py-3 text-left transition ${selectedId === stage.id ? 'dhp-stage-active' : 'text-slate-300 hover:bg-white/5'}`}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-400/30 bg-amber-400/10 text-xs font-bold text-amber-300">{stage.order}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{stage.name}</p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">{stage.agent}</p>
                    </div>
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  </div>
                </button>
              ))}
            </div>
          </aside>

          <section className="space-y-5">
            <div className="dhp-panel rounded-2xl p-6">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">Công đoạn {selected.order}</p>
                  <h3 className="mt-2 text-2xl font-bold text-white">{selected.name}</h3>
                  <p className="mt-2 flex items-center gap-2 text-sm font-medium text-slate-300"><Bot className="h-4 w-4 text-amber-300" /> {selected.agent}</p>
                </div>
                <span className="inline-flex items-center gap-2 self-start rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-semibold text-emerald-300">
                  <ShieldCheck className="h-4 w-4" /> Có cổng kiểm soát
                </span>
              </div>
              <p className="mt-5 border-l-2 border-amber-400/50 pl-4 leading-7 text-slate-300">{selected.purpose}</p>
            </div>

            <div className="grid gap-5 md:grid-cols-2">
              <div className="dhp-panel rounded-2xl p-5">
                <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-400">Đầu vào bắt buộc</h4>
                <div className="mt-4 space-y-3">
                  {selected.inputs.map((item) => <p key={item} className="flex gap-2 text-sm text-slate-300"><span className="mt-2 h-1.5 w-1.5 rounded-full bg-amber-400" />{item}</p>)}
                </div>
              </div>
              <div className="dhp-panel rounded-2xl p-5">
                <h4 className="text-sm font-bold uppercase tracking-[0.14em] text-slate-400">Đầu ra tiêu chuẩn</h4>
                <div className="mt-4 space-y-3">
                  {selected.outputs.map((item) => <p key={item} className="flex gap-2 text-sm text-slate-300"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-amber-300" />{item}</p>)}
                </div>
              </div>
            </div>

            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-5">
              <p className="flex items-center gap-2 text-sm font-bold text-amber-300"><UserCheck className="h-5 w-5" /> Điều kiện chuyển công đoạn</p>
              <p className="mt-2 text-sm leading-6 text-slate-300">{selected.gate}</p>
            </div>
          </section>
        </div>

        <section className="dhp-panel rounded-2xl p-6">
          <h3 className="text-xl font-bold text-white">Quy tắc điều phối chung</h3>
          <div className="mt-5 grid gap-3 md:grid-cols-2">
            {AI_ROUTING_RULES.principles.map((rule, index) => (
              <div key={rule} className="flex gap-3 rounded-xl border border-white/5 bg-white/[0.025] p-4 text-sm leading-6 text-slate-300">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-amber-400/10 font-bold text-amber-300">{index + 1}</span>
                {rule}
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
};

export default AIOrchestration;
