"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { SeriesItem, VideoItem, ProviderItem, YtStatus } from "./StudioApp";

interface StudioState {
  series: SeriesItem[];
  videos: VideoItem[];
  providers: ProviderItem[];
  yt: YtStatus;
  setYt: (s: YtStatus) => void;
  toast: string | null;
  say: (msg: string) => void;

  dailyGoal: number;
  timezone: string;
  setDailyGoal: (n: number) => Promise<void>;
  autopilotActive: boolean;
  toggleAllAutopilot: () => Promise<void>;

  // one-off forge form
  topic: string;
  setTopic: (v: string) => void;
  niche: string;
  setNiche: (v: string) => void;
  voice: string;
  setVoice: (v: string) => void;
  style: string;
  setStyle: (v: string) => void;
  format: "short" | "long";
  setFormat: (v: "short" | "long") => void;
  autoUpload: boolean;
  setAutoUpload: (v: boolean) => void;
  privacy: string;
  setPrivacy: (v: string) => void;
  forging: boolean;
  randomTopic: () => void;
  forgeNow: () => Promise<void>;

  // series form
  sName: string;
  setSName: (v: string) => void;
  sNiche: string;
  setSNiche: (v: string) => void;
  sFormat: "short" | "long";
  setSFormat: (v: "short" | "long") => void;
  sFreq: string;
  setSFreq: (v: string) => void;
  sAutopilot: boolean;
  setSAutopilot: (v: boolean) => void;
  sUpload: boolean;
  setSUpload: (v: boolean) => void;
  createSeries: () => Promise<void>;
  patchSeries: (id: string, patch: Record<string, unknown>) => Promise<void>;
  runSeries: (id: string) => Promise<void>;
  deleteSeries: (id: string) => Promise<void>;

  actionVideo: (id: string, action: "retry" | "delete") => Promise<void>;
  logout: () => Promise<void>;
}

const Ctx = createContext<StudioState | null>(null);

export function useStudio(): StudioState {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useStudio must be used inside <StudioProvider>");
  return ctx;
}

export function StudioProvider({ children }: { children: ReactNode }) {
  const [series, setSeries] = useState<SeriesItem[]>([]);
  const [videos, setVideos] = useState<VideoItem[]>([]);
  const [providers, setProviders] = useState<ProviderItem[]>([]);
  const [yt, setYt] = useState<YtStatus>({ configured: false, connected: false, channelTitle: null, channelId: null });
  const [toast, setToast] = useState<string | null>(null);
  const [dailyGoal, setDailyGoalState] = useState(3);
  const [timezone, setTimezone] = useState("Asia/Kathmandu");

  const [topic, setTopic] = useState("black holes");
  const [niche, setNiche] = useState("space");
  const [voice, setVoice] = useState("atlas");
  const [style, setStyle] = useState("cinematic");
  const [format, setFormat] = useState<"short" | "long">("short");
  const [autoUpload, setAutoUpload] = useState(true);
  const [privacy, setPrivacy] = useState("private");
  const [forging, setForging] = useState(false);

  const [sName, setSName] = useState("Cosmic Daily");
  const [sNiche, setSNiche] = useState("space");
  const [sFormat, setSFormat] = useState<"short" | "long">("short");
  const [sFreq, setSFreq] = useState("daily");
  const [sAutopilot, setSAutopilot] = useState(true);
  const [sUpload, setSUpload] = useState(true);

  const say = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3600);
  }, []);

  const loadVideos = useCallback(() => {
    fetch("/api/videos")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setVideos(d.items))
      .catch(() => {});
  }, []);

  useEffect(() => {
    fetch("/api/series").then((r) => r.json()).then((d) => setSeries(d.items)).catch(() => {});
    fetch("/api/providers").then((r) => r.json()).then((d) => setProviders(d.items)).catch(() => {});
    fetch("/api/youtube/status").then((r) => r.json()).then(setYt).catch(() => {});
    fetch("/api/settings")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.dailyGoal) setDailyGoalState(d.dailyGoal);
        if (d?.timezone) setTimezone(d.timezone);
      })
      .catch(() => {});
    loadVideos();
    const flag = new URLSearchParams(window.location.search).get("yt");
    if (flag === "connected") say("YouTube connected — uploads are armed.");
    if (flag === "error") say("YouTube connection failed.");
    if (flag === "unconfigured") say("Add GOOGLE_CLIENT_ID / SECRET to env first.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Every poll costs a database connection — go easy, and pause while the tab is hidden.
    const id = setInterval(() => { if (!document.hidden) loadVideos(); }, 15000);
    return () => clearInterval(id);
  }, [loadVideos]);

  const randomTopic = useCallback(() => {
    import("@/lib/generator").then(({ NICHES }) => {
      const bank = NICHES.find((n) => n.id === niche)?.topics ?? ["a new topic"];
      setTopic(bank[Math.floor(Math.random() * bank.length)]);
    });
  }, [niche]);

  const forgeNow = useCallback(async () => {
    if (forging || !topic.trim()) return;
    setForging(true);
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, niche, voice, style, format, autoUpload: autoUpload && yt.connected, privacy }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `request failed (${res.status})`);
      }
      say("Forging started — watch the queue.");
      setTimeout(loadVideos, 800);
    } catch (err) {
      say(err instanceof Error ? err.message : "Failed to queue the video.");
    } finally {
      setForging(false);
    }
  }, [forging, topic, niche, voice, style, format, autoUpload, privacy, yt.connected, say, loadVideos]);

  const createSeries = useCallback(async () => {
    try {
      const res = await fetch("/api/series", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: sName, niche: sNiche, format: sFormat, frequency: sFreq,
          autopilot: sAutopilot, autoUpload: sUpload && yt.connected, privacy, voice, style,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `request failed (${res.status})`);
      }
      const d = await res.json();
      setSeries((s) => [d.series, ...s]);
      say(`Series "${sName}" armed.`);
    } catch (err) {
      say(err instanceof Error ? err.message : "Failed to create series.");
    }
  }, [sName, sNiche, sFormat, sFreq, sAutopilot, sUpload, yt.connected, privacy, voice, style, say]);

  const patchSeries = useCallback(async (id: string, patch: Record<string, unknown>) => {
    setSeries((list) =>
      list.map((s) =>
        s.id === id
          ? {
              ...s,
              ...patch,
              autopilot: patch.autopilot !== undefined ? (patch.autopilot ? 1 : 0) : s.autopilot,
              autoUpload: patch.autoUpload !== undefined ? (patch.autoUpload ? 1 : 0) : s.autoUpload,
            }
          : s,
      ),
    );
    await fetch(`/api/series/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
  }, []);

  const runSeries = useCallback(
    async (id: string) => {
      await fetch(`/api/series/${id}/run`, { method: "POST" });
      say("Series fired — video queued.");
      setTimeout(loadVideos, 800);
    },
    [say, loadVideos],
  );

  const deleteSeries = useCallback(async (id: string) => {
    setSeries((list) => list.filter((s) => s.id !== id));
    await fetch(`/api/series/${id}`, { method: "DELETE" });
  }, []);

  const actionVideo = useCallback(
    async (id: string, action: "retry" | "delete") => {
      if (action === "delete") {
        setVideos((v) => v.filter((x) => x.id !== id));
        await fetch(`/api/videos/${id}`, { method: "DELETE" });
      } else {
        await fetch(`/api/videos/${id}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "retry" }),
        });
        setTimeout(loadVideos, 800);
      }
    },
    [loadVideos],
  );

  const setDailyGoal = useCallback(async (n: number) => {
    if (!n || n < 1) return;
    setDailyGoalState(n);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dailyGoal: n }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || `request failed (${res.status})`);
      }
    } catch (err) {
      say(err instanceof Error ? err.message : "Failed to update daily goal.");
    }
  }, [say]);

  const autopilotActive = series.length > 0 && series.some((s) => s.autopilot === 1);

  const toggleAllAutopilot = useCallback(async () => {
    const nextOn = !autopilotActive;
    const targets = series.filter((s) => (nextOn ? s.autopilot !== 1 : s.autopilot === 1));
    setSeries((list) => list.map((s) => ({ ...s, autopilot: nextOn ? 1 : 0 })));
    try {
      await Promise.all(
        targets.map((s) =>
          fetch(`/api/series/${s.id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ autopilot: nextOn }),
          }),
        ),
      );
      say(nextOn ? "Autopilot resumed for all series." : "Autopilot paused for all series.");
    } catch {
      say("Failed to update some series — check My Series.");
    }
  }, [autopilotActive, series, say]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }, []);

  const value: StudioState = {
    series, videos, providers, yt, setYt, toast, say,
    dailyGoal, timezone, setDailyGoal, autopilotActive, toggleAllAutopilot,
    topic, setTopic, niche, setNiche, voice, setVoice, style, setStyle,
    format, setFormat, autoUpload, setAutoUpload, privacy, setPrivacy,
    forging, randomTopic, forgeNow,
    sName, setSName, sNiche, setSNiche, sFormat, setSFormat, sFreq, setSFreq,
    sAutopilot, setSAutopilot, sUpload, setSUpload,
    createSeries, patchSeries, runSeries, deleteSeries,
    actionVideo, logout,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
