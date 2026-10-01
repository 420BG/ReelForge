"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Film, Loader2, Upload } from "lucide-react";
import { useStudio } from "@/components/studio/StudioContext";
import type { AgentVideo, StoryPlan } from "@/content/types";
import { api, fileUrl, formatDuration, post, useAgent } from "./data";
import { Button, Chip, Panel } from "./ui";

const CATEGORIES: [string, string][] = [
  ["1", "Film & Animation"], ["22", "People & Blogs"], ["24", "Entertainment"], ["27", "Education"],
  ["28", "Science & Technology"], ["26", "Howto & Style"], ["23", "Comedy"], ["17", "Sports"], ["20", "Gaming"], ["10", "Music"],
];

export default function Publish({ id }: { id: string }) {
  const { notify, refresh } = useAgent();
  const { yt } = useStudio();
  const [video, setVideo] = useState<AgentVideo | null>(null);
  const [seo, setSeo] = useState<StoryPlan["seo"] | null>(null);
  const [privacy, setPrivacy] = useState<"private" | "unlisted" | "public">("private");
  const [step, setStep] = useState(1);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  useEffect(() => {
    void api<{ video: AgentVideo }>(`/api/agent/videos/${id}`).then(({ video: v }) => {
      setVideo(v); setSeo(v.story?.seo ?? null); setPrivacy(v.privacy);
      if (v.youtubeVideoId) setDone(`https://youtu.be/${v.youtubeVideoId}`);
    }).catch(() => setVideo(null));
  }, [id]);

  if (!video) return <div className="flex justify-center py-20 text-dim"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  if (!video.story || !seo) return <div className="py-20 text-center text-sm text-dim">This video has no story yet. <Link href={`/studio/videos/${id}`} className="text-lime">Open editor</Link></div>;

  const canPublish = video.hasFinal && (video.workflow === "review" || video.workflow === "approved");

  async function publish() {
    if (!video || !seo) return;
    setBusy(true);
    try {
      // 1) save the reviewed title/description/tags/visibility
      await api(`/api/agent/videos/${id}`, post({ story: { ...video.story, seo }, settings: { ...video.settings, privacy } }, "PATCH"));
      // 2) explicit human approval (this click), then 3) upload
      if (video.workflow === "review") await api(`/api/agent/videos/${id}`, post({ workflow: "approved" }, "PATCH"));
      const result = await api<{ url?: string; video: AgentVideo }>(`/api/agent/videos/${id}/action`, post({ action: "publish" }));
      setDone(result.url ?? null);
      setVideo(result.video);
      notify("Uploaded to YouTube.");
      void refresh();
    } catch (error) { notify(error instanceof Error ? error.message : "Upload failed.", "error"); }
    finally { setBusy(false); }
  }

  const steps = ["Details", "Thumbnail", "Visibility", "Upload"];
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-4 flex items-center justify-between"><Link href={`/studio/videos/${id}`} className="text-xs font-semibold text-dim hover:text-cream">← Back to editor</Link></div>
      <h1 className="mb-5 flex items-center gap-2 font-display text-2xl font-bold tracking-tight"><Upload className="h-5 w-5 text-lime" /> Publish to YouTube</h1>
      <ol className="mb-6 grid grid-cols-4 gap-2">
        {steps.map((label, i) => (
          <li key={label}><button type="button" onClick={() => setStep(i + 1)} className="flex w-full flex-col items-center gap-1.5">
            <span className={`grid h-7 w-7 place-items-center rounded-full text-[11px] font-bold ${step === i + 1 ? "bg-lime text-void" : step > i + 1 ? "bg-lime/20 text-lime" : "border border-white/15 text-dim"}`}>{i + 1}</span>
            <span className={`text-[11px] ${step === i + 1 ? "text-cream" : "text-dim"}`}>{label}</span>
          </button></li>
        ))}
      </ol>

      <div className="grid gap-5 md:grid-cols-[220px_1fr]">
        <div className="overflow-hidden rounded-2xl border border-white/[0.08] bg-ink">
          {video.hasCover ? <img src={fileUrl(video.id, "cover")} alt="" className={`${video.settings.format === "long" ? "aspect-video" : "aspect-[9/16]"} w-full object-cover`} /> : <div className="grid aspect-[9/16] place-items-center text-dim"><Film className="h-6 w-6" /></div>}
          <div className="p-3 text-[11px] text-dim"><p className="font-bold text-cream">{video.title}</p>{formatDuration(video.durationSec)} · {video.settings.format === "long" ? "16:9" : "9:16"} · {video.niche}</div>
        </div>

        <Panel>
          {done ? (
            <div className="py-8 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-lime" />
              <p className="font-display text-lg font-bold">Published ({privacy})</p>
              <a href={done} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm font-semibold text-lime">{done} <ExternalLink className="h-3.5 w-3.5" /></a>
            </div>
          ) : (
            <>
              {step === 1 && (
                <div className="space-y-3">
                  <label className="block text-xs font-semibold text-mute">Title<input maxLength={95} value={seo.title} onChange={(e) => setSeo({ ...seo, title: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm text-cream outline-none focus:border-lime/50" /><span className="text-[10px] text-dim">{seo.title.length}/95{video.settings.format === "long" ? " · long video (16:9)" : " · “#Shorts” is added on upload"}</span></label>
                  <label className="block text-xs font-semibold text-mute">Description<textarea rows={5} value={seo.description} onChange={(e) => setSeo({ ...seo, description: e.target.value })} className="mt-1 w-full rounded-xl border border-white/12 bg-white/[0.04] p-3 text-sm text-cream outline-none focus:border-lime/50" /></label>
                  <label className="block text-xs font-semibold text-mute">Tags<input value={seo.tags.join(", ")} onChange={(e) => setSeo({ ...seo, tags: e.target.value.split(",").map((t) => t.trim()).filter(Boolean) })} className="mt-1 h-11 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm text-cream outline-none focus:border-lime/50" /></label>
                  <label className="block text-xs font-semibold text-mute">Hashtags<input value={seo.hashtags.join(" ")} onChange={(e) => setSeo({ ...seo, hashtags: e.target.value.split(/\s+/).filter(Boolean) })} className="mt-1 h-11 w-full rounded-xl border border-white/12 bg-white/[0.04] px-3 text-sm text-cream outline-none focus:border-lime/50" /></label>
                  <label className="block text-xs font-semibold text-mute">Category<select value={seo.categoryId} onChange={(e) => setSeo({ ...seo, categoryId: e.target.value })} className="mt-1 h-11 w-full rounded-xl border border-white/12 bg-ink px-3 text-sm text-cream outline-none">{CATEGORIES.map(([cid, label]) => <option key={cid} value={cid}>{label}</option>)}</select></label>
                  <p className="text-[11px] text-dim">Suggested publish time: {seo.suggestedPublishTime}</p>
                </div>
              )}
              {step === 2 && (
                <div className="space-y-2 text-sm text-mute">
                  <p>The cover on the left is generated from your first scene with the title burned in.</p>
                  <p className="text-[11px] text-dim">{video.settings.format === "long" ? "Download the cover and set it as the custom thumbnail in YouTube Studio (custom thumbnails need a verified channel)." : "For Shorts, YouTube picks the thumbnail from the video frames; custom thumbnail upload for Shorts isn't supported by the YouTube API."}</p>
                  {video.hasCover && <Button variant="outline" href={fileUrl(video.id, "cover", "&download=1")} className="text-xs">Download cover</Button>}
                </div>
              )}
              {step === 3 && (
                <div className="space-y-3">
                  <p className="text-xs font-semibold text-mute">Visibility</p>
                  <div className="flex gap-2">{(["private", "unlisted", "public"] as const).map((p) => <Chip key={p} on={privacy === p} onClick={() => setPrivacy(p)}>{p}</Chip>)}</div>
                  <p className="text-[11px] text-dim">Audience: {video.audience === "kids" ? "Made for kids" : "Not made for kids"} (set by the niche). The description includes an AI-content note and the upload sets YouTube&apos;s synthetic-media flag.</p>
                </div>
              )}
              {step === 4 && (
                <div className="space-y-3 text-sm">
                  {!yt.connected && <div className="flex gap-2 rounded-xl border border-amber-300/25 bg-amber-300/[0.07] p-3 text-xs text-amber-100"><AlertTriangle className="h-4 w-4 shrink-0" /> Connect YouTube first on the <Link href="/studio/youtube" className="font-bold text-lime underline">YouTube page</Link>.</div>}
                  {!video.hasFinal && <p className="text-xs text-red-300">Render the video before publishing.</p>}
                  <dl className="divide-y divide-white/[0.06] rounded-2xl border border-white/[0.07]">
                    {[["Title", video.settings.format === "long" ? seo.title : `${seo.title} #Shorts`], ["Visibility", privacy], ["Channel", yt.channelTitle ?? (yt.connected ? "Connected" : "Not connected")]].map(([k, v]) => <div key={k} className="flex justify-between gap-3 px-4 py-2.5"><dt className="text-dim">{k}</dt><dd className="truncate text-right font-semibold">{v}</dd></div>)}
                  </dl>
                  <Button onClick={() => void publish()} busy={busy} disabled={!canPublish || !yt.connected} className="w-full"><Upload className="h-4 w-4" /> Approve & publish to YouTube</Button>
                </div>
              )}
              {step < 4 && <div className="mt-5 flex justify-end"><Button onClick={() => setStep(step + 1)}>Next</Button></div>}
            </>
          )}
        </Panel>
      </div>
    </div>
  );
}
