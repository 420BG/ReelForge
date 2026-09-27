"use client";

import { useMemo, useState } from "react";
import { Power, Play, Trash2, Timer, Calendar, Pencil, Check, X, Clock3 } from "lucide-react";
import { NICHES } from "@/lib/generator";
import { timeUntil, timeAgo } from "@/components/studio/StudioApp";
import { useStudio } from "@/components/studio/StudioContext";

const inputCls =
  "h-12 rounded-xl border border-white/12 bg-white/[0.04] px-4 text-sm text-cream outline-none transition placeholder:text-dim focus:border-lime/50";
const chipCls = (on: boolean) =>
  `rounded-full border px-3.5 py-2 text-xs font-semibold transition ${
    on ? "border-lime/60 bg-lime/[0.08] text-cream" : "border-white/10 bg-white/[0.02] text-mute hover:text-cream"
  }`;

function todayKey(tz: string) {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

function statusPill(status: string) {
  const done = status === "posted" || status === "rendered";
  const failed = status === "failed";
  const cls = failed
    ? "bg-red-400/15 text-red-300"
    : done
      ? "bg-lime/15 text-lime"
      : "bg-violet/15 text-violet-soft";
  const label = failed ? "Failed" : done ? "Done" : status[0].toUpperCase() + status.slice(1);
  return <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${cls}`}>{label}</span>;
}

export default function AutopilotPage() {
  const {
    series, sName, setSName, sNiche, setSNiche, sFreq, setSFreq, sFormat, setSFormat,
    sAutopilot, setSAutopilot, sUpload, setSUpload, yt, createSeries,
    patchSeries, runSeries, deleteSeries,
    videos, dailyGoal, setDailyGoal, timezone, autopilotActive, toggleAllAutopilot,
  } = useStudio();

  const [showCreate, setShowCreate] = useState(false);
  const [tab, setTab] = useState<"series" | "history">("series");
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState(String(dailyGoal));

  const key = todayKey(timezone);
  const doneToday = useMemo(
    () => videos.filter((v) => v.createdAt.slice(0, 10) === key).length,
    [videos, key],
  );

  const nextRun = useMemo(() => {
    const active = series.filter((s) => s.autopilot === 1);
    if (active.length === 0) return null;
    return active.reduce((soonest, s) => (new Date(s.nextRunAt) < new Date(soonest.nextRunAt) ? s : soonest));
  }, [series]);

  const history = useMemo(
    () =>
      videos
        .filter((v) => v.seriesId)
        .slice()
        .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
        .slice(0, 30),
    [videos],
  );

  const saveGoal = async () => {
    const n = parseInt(goalInput, 10);
    if (n > 0) await setDailyGoal(n);
    setEditingGoal(false);
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight sm:text-4xl">Autopilot</h1>
          <p className="mt-2 max-w-xl text-sm text-mute">Set it once. Let AI do the rest.</p>
        </div>
        <button
          onClick={toggleAllAutopilot}
          className={`flex items-center gap-2.5 rounded-full border px-4 py-2 text-sm font-bold transition ${
            autopilotActive ? "border-lime/50 bg-lime/10 text-lime" : "border-white/10 bg-white/[0.03] text-mute"
          }`}
        >
          <span className={`h-2 w-2 rounded-full ${autopilotActive ? "bg-lime" : "bg-dim"}`} />
          {autopilotActive ? "Active" : "Paused"}
        </button>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-2">
        <section className="glass-deep rounded-3xl p-5">
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 font-display text-sm font-bold">
              <Timer className="h-4 w-4 text-lime" /> Daily goal
            </h2>
            {editingGoal ? (
              <div className="flex items-center gap-1.5">
                <input
                  value={goalInput}
                  onChange={(e) => setGoalInput(e.target.value.replace(/\D/g, ""))}
                  className="h-8 w-14 rounded-lg border border-white/12 bg-white/[0.04] px-2 text-center text-sm text-cream outline-none focus:border-lime/50"
                />
                <button onClick={saveGoal} className="grid h-8 w-8 place-items-center rounded-lg text-lime"><Check className="h-4 w-4" /></button>
                <button onClick={() => { setEditingGoal(false); setGoalInput(String(dailyGoal)); }} className="grid h-8 w-8 place-items-center rounded-lg text-dim"><X className="h-4 w-4" /></button>
              </div>
            ) : (
              <button onClick={() => setEditingGoal(true)} className="grid h-8 w-8 place-items-center rounded-lg text-dim transition hover:text-lime">
                <Pencil className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="mt-3 text-2xl font-bold text-cream">
            {doneToday} <span className="text-base font-semibold text-dim">/ {dailyGoal} videos</span>
          </p>
          <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
            <div
              className="h-full rounded-full bg-lime transition-all"
              style={{ width: `${Math.min(100, (doneToday / Math.max(1, dailyGoal)) * 100)}%` }}
            />
          </div>
        </section>

        <section className="glass-deep rounded-3xl p-5">
          <h2 className="flex items-center gap-2 font-display text-sm font-bold">
            <Calendar className="h-4 w-4 text-lime" /> Next run
          </h2>
          {nextRun ? (
            <>
              <p className="mt-3 truncate text-lg font-bold text-cream">{nextRun.name}</p>
              <p className="mt-1 text-xs text-dim">
                {timeUntil(nextRun.nextRunAt)} · {timezone.replace("_", " ")}
              </p>
            </>
          ) : (
            <p className="mt-3 text-sm text-dim">No active series — arm one below.</p>
          )}
        </section>
      </div>

      <div className="mb-5 flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.02] p-1 w-fit">
        <button
          onClick={() => setTab("series")}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${tab === "series" ? "bg-lime text-void" : "text-mute"}`}
        >
          My Series
        </button>
        <button
          onClick={() => setTab("history")}
          className={`rounded-full px-4 py-1.5 text-xs font-bold transition ${tab === "history" ? "bg-lime text-void" : "text-mute"}`}
        >
          Schedule &amp; History
        </button>
      </div>

      {tab === "series" ? (
        <div className="space-y-5">
          <section className="glass-deep rounded-3xl p-6 sm:p-7">
            <div className="mb-5 flex items-center justify-between">
              <h2 className="font-display text-lg font-bold">Active series</h2>
              {!showCreate && (
                <button
                  onClick={() => setShowCreate(true)}
                  className="flex h-9 items-center gap-1.5 rounded-full border border-lime/40 px-3.5 text-xs font-bold text-lime transition hover:bg-lime/10"
                >
                  <Power className="h-3.5 w-3.5" /> Create new series
                </button>
              )}
            </div>

            {showCreate && (
              <div className="mb-5 space-y-3 rounded-2xl border border-white/[0.08] bg-void/50 p-4">
                <div className="grid grid-cols-2 gap-3">
                  <input value={sName} onChange={(e) => setSName(e.target.value)} maxLength={60} className={`${inputCls} col-span-2 w-full`} placeholder="Series name" />
                  <select value={sNiche} onChange={(e) => setSNiche(e.target.value)} className={`${inputCls} w-full appearance-none`}>
                    {NICHES.map((n) => <option key={n.id} value={n.id} className="bg-ink">{n.label}</option>)}
                  </select>
                  <select value={sFreq} onChange={(e) => setSFreq(e.target.value)} className={`${inputCls} w-full appearance-none`}>
                    <option value="daily" className="bg-ink">Every day</option>
                    <option value="weekly" className="bg-ink">Every week</option>
                  </select>
                  <select value={sFormat} onChange={(e) => setSFormat(e.target.value as "short" | "long")} className={`${inputCls} w-full appearance-none`}>
                    <option value="short" className="bg-ink">Short (9:16)</option>
                    <option value="long" className="bg-ink">Long video (16:9)</option>
                  </select>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setSAutopilot(!sAutopilot)} className={chipCls(sAutopilot)}>Autopilot {sAutopilot ? "on" : "off"}</button>
                    <button onClick={() => yt.connected && setSUpload(!sUpload)} className={chipCls(sUpload && yt.connected)}>Auto-upload</button>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => { await createSeries(); setShowCreate(false); }}
                    className="flex h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-lime text-sm font-bold text-void transition hover:brightness-110"
                  >
                    <Power className="h-4 w-4" /> Arm this series
                  </button>
                  <button onClick={() => setShowCreate(false)} className="h-11 rounded-xl border border-white/10 px-4 text-sm font-semibold text-mute">
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-2.5">
              {series.length === 0 && (
                <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-xs text-dim">
                  No series yet. Arm one above and the forge will post on schedule forever.
                </p>
              )}
              {series.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                  <span
                    className="h-2.5 w-2.5 shrink-0 rounded-full"
                    style={{ background: NICHES.find((n) => n.id === s.niche)?.hue ?? "#8B7CFF" }}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-bold">{s.name}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${s.autopilot === 1 ? "bg-lime/15 text-lime" : "bg-white/[0.06] text-dim"}`}>
                        {s.autopilot === 1 ? "Active" : "Paused"}
                      </span>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-dim">
                      <Timer className="h-3 w-3" />
                      {s.format} · {s.frequency} · next {timeUntil(s.nextRunAt)}
                    </p>
                  </div>
                  <button
                    onClick={() => patchSeries(s.id, { autopilot: s.autopilot !== 1 })}
                    className={`grid h-8 w-8 place-items-center rounded-lg border transition ${s.autopilot === 1 ? "border-lime/40 text-lime" : "border-white/10 text-dim"}`}
                    title={s.autopilot === 1 ? "Pause" : "Resume"}
                  >
                    <Power className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => runSeries(s.id)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-mute transition hover:border-lime/40 hover:text-lime" title="Run now">
                    <Play className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deleteSeries(s.id)} className="grid h-8 w-8 place-items-center rounded-lg border border-white/10 text-mute transition hover:border-red-400/40 hover:text-red-400" title="Delete">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </section>
        </div>
      ) : (
        <section className="glass-deep rounded-3xl p-6 sm:p-7">
          <h2 className="mb-5 font-display text-lg font-bold">Schedule &amp; history</h2>
          <div className="space-y-2.5">
            {history.length === 0 && (
              <p className="rounded-xl border border-dashed border-white/10 px-4 py-5 text-center text-xs text-dim">
                No autopilot runs yet — once a series fires, its videos show up here.
              </p>
            )}
            {history.map((v) => {
              const s = series.find((x) => x.id === v.seriesId);
              return (
                <div key={v.id} className="flex items-center gap-3 rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-lime">
                    <Clock3 className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold">{v.title}</p>
                    <p className="mt-0.5 text-[11px] text-dim">{s?.name ?? "One-off"} · {timeAgo(v.createdAt)}</p>
                  </div>
                  {statusPill(v.status)}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
