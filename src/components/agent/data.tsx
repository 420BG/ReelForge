"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AgentConfig, AgentJob, AgentVideo, VisualStyle, Workflow } from "@/content/types";

/* Shared client data for the Agent screens: one poll loop for the whole studio. */

export type ProviderHealth = { calls: number; failures: number; exhausted: boolean } | null;
export type FreeProvider = { id: string; label?: string; model?: string; env?: string; configured: boolean; health?: ProviderHealth };
export type NicheSummary = {
  id: string; label: string; emoji: string; description: string; audience: "general" | "kids";
  subNiches: { id: string; label: string }[]; defaultStyle: VisualStyle; pacing: string; topics: string[];
};
export type ProviderInfo = {
  id: string; label: string; paid: boolean; tier?: "free" | "free-tier" | "paid"; configured: boolean; enabled?: boolean; usable?: boolean;
  status?: "ready" | "enabled" | "not-configured" | "disabled" | "blocked-free-mode"; reason?: string;
  capabilities: { textToVideo: boolean; imageToVideo: boolean }; pricePerSecond: number | null; health?: ProviderHealth;
};
export type FreeUsage = {
  target: { short: number; long: number };
  videos: { short: { started: number; finished: number }; long: { started: number; finished: number } };
  remaining: { short: number; long: number };
  aiCallsToday: number; paidCallsToday: number; outOfQuota: string[]; note: string;
};
export type ActiveJob = AgentJob & { title: string; niche: string; provider: string | null };
export type Overview = {
  counts: Record<Workflow | "total", number>;
  activity: { today: number; week: number; queue: number };
  jobs: ActiveJob[];
  failures: (AgentJob & { title: string })[];
  usage: { clips: number; cost: number };
  recent: AgentVideo[];
  config: AgentConfig;
  niches: NicheSummary[];
  status: {
    providers: ProviderInfo[]; textModel: boolean; voice: { free: boolean; pollinations: boolean; elevenlabs: boolean };
    imageMode: { allowed: boolean; available: boolean }; stockMode?: { allowed: boolean; available: boolean };
    free?: { text: FreeProvider[]; images: FreeProvider[]; stock: FreeProvider[]; voice: FreeProvider[] };
    daily?: { short: string | null; long: string | null; background: boolean };
    freeMode?: boolean;
    freeUsage?: FreeUsage;
    ffmpeg: boolean; youtubeConnected: boolean; youtubeChannelTitle: string | null; worker: string;
  };
};

export async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json().catch(() => ({}));
  if (response.status === 401) { window.location.href = "/login"; throw new Error("Session expired."); }
  if (!response.ok) throw new Error((data as { error?: string }).error || `Request failed (${response.status}).`);
  return data as T;
}
export const post = (body: unknown, method = "POST"): RequestInit => ({ method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

type Ctx = {
  overview: Overview | null;
  error: string | null;
  refresh: (drive?: boolean) => Promise<void>;
  notify: (message: string, kind?: "ok" | "error") => void;
  toast: { message: string; kind: "ok" | "error" } | null;
};

const AgentCtx = createContext<Ctx | null>(null);

export function useAgent() {
  const ctx = useContext(AgentCtx);
  if (!ctx) throw new Error("useAgent must be used inside <AgentDataProvider>");
  return ctx;
}

export function AgentDataProvider({ children }: { children: ReactNode }) {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<Ctx["toast"]>(null);
  const busy = useRef(false);

  const notify = useCallback((message: string, kind: "ok" | "error" = "ok") => {
    setToast({ message, kind });
    window.setTimeout(() => setToast(null), 4200);
  }, []);

  const refresh = useCallback(async (drive = false) => {
    if (busy.current) return;
    busy.current = true;
    try {
      // While jobs are queued, each poll also advances them one step (works even without a cron).
      if (drive) await fetch("/api/agent/tick", { method: "POST" }).catch(() => undefined);
      setOverview(await api<Overview>("/api/agent/overview"));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load the agent.");
    } finally {
      busy.current = false;
    }
  }, []);

  const active = (overview?.jobs.length ?? 0) > 0;
  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => {
    // Poll less when idle, retry quickly after a failed first load, and pause while the tab is hidden
    // (each poll uses a database connection).
    const every = active ? 5000 : error && !overview ? 6000 : 20000;
    const id = window.setInterval(() => { if (!document.hidden) void refresh(active); }, every);
    return () => window.clearInterval(id);
  }, [refresh, active, error, overview]);

  return <AgentCtx.Provider value={{ overview, error, refresh, notify, toast }}>{children}</AgentCtx.Provider>;
}

export const fileUrl = (id: string, kind: string, extra = "") => `/api/agent/videos/${id}/file?kind=${kind}${extra}`;

export function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return "—";
  const s = Math.round(seconds);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

export function greeting() {
  const hour = new Date().getHours();
  return hour < 5 ? "Good night" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}
