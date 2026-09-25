"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { Sparkles } from "lucide-react";
import CountUp from "./CountUp";
import { TRENDING_TOPICS } from "@/lib/generator";

const FALLBACK = { videos: 128412, creators: 12408, views: 48_200_000, score: 94 };

export function Stats() {
  const [stats, setStats] = useState(FALLBACK);

  useEffect(() => {
    fetch("/api/stats")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setStats(d))
      .catch(() => {});
  }, []);

  const items = [
    { label: "Shorts forged", value: stats.videos, suffix: "+", format: (v: number) => Math.round(v).toLocaleString("en-US") },
    { label: "Faceless creators", value: stats.creators, suffix: "+", format: (v: number) => Math.round(v).toLocaleString("en-US") },
    { label: "Views driven", value: stats.views, suffix: "", format: (v: number) => `${(v / 1_000_000).toFixed(1)}M` },
    { label: "Avg. virality score", value: stats.score, suffix: "/100", format: (v: number) => Math.round(v).toString() },
  ];

  return (
    <section className="relative border-y border-white/[0.06] bg-ink/60">
      <div className="mx-auto grid max-w-7xl grid-cols-2 divide-x divide-white/[0.06] lg:grid-cols-4">
        {items.map((it) => (
          <div key={it.label} className="flex flex-col items-center gap-1 px-4 py-10 text-center">
            <span className="font-display text-4xl font-bold tracking-tight sm:text-5xl">
              <CountUp value={it.value} format={it.format} suffix={it.suffix} />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.2em] text-dim">
              {it.label}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

function Chip({ label }: { label: string }) {
  return (
    <span className="mx-2 flex items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm font-medium text-mute transition hover:border-lime/40 hover:text-cream">
      <Sparkles className="h-3.5 w-3.5 text-lime" />
      {label}
    </span>
  );
}

export function TopicsMarquee() {
  const rowA = TRENDING_TOPICS.slice(0, 8);
  const rowB = TRENDING_TOPICS.slice(8);
  return (
    <section className="mask-fade-x overflow-hidden py-14">
      <div className="mb-3 overflow-hidden">
        <div className="marquee-track" style={{ "--marquee-dur": "52s" } as CSSProperties}>
          {[...rowA, ...rowA].map((t, i) => (
            <Chip key={`${t}-${i}`} label={t} />
          ))}
        </div>
      </div>
      <div className="overflow-hidden">
        <div className="marquee-track reverse" style={{ "--marquee-dur": "60s" } as CSSProperties}>
          {[...rowB, ...rowB].map((t, i) => (
            <Chip key={`${t}-${i}`} label={t} />
          ))}
        </div>
      </div>
      <p className="mt-8 text-center text-[11px] font-semibold uppercase tracking-[0.26em] text-dim">
        Trending niches being forged right now
      </p>
    </section>
  );
}
