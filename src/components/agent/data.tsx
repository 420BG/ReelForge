"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { AgentConfig, AgentJob, AgentVideo, VisualStyle, Workflow } from "@/content/types";

/* Shared client data for the Agent screens: one poll loop for the whole studio. */

export type FreeProvider = { id: string; label?: string; model?: string; env?: string; configured: boolean };
export type NicheSummary = {
  id: string; label: string; emoji: string; description: string; audience: "general" | "kids";
  subNiches: { id: string; label: string }[]; defaultStyle: VisualStyle; pacing: string; topics: string[];
};
export type ProviderInfo = { id: string; label: string; paid: boolean; configured: boolean; capabilities: { textToVideo: boolean; imageToVideo: boolean }; pricePerSecond: number | null };
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
    const id = window.setInterval(() => { void refresh(active); }, active ? 5000 : 20000);
    return () => window.clearInterval(id);
  }, [refresh, active]);

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
