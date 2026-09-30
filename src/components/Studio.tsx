"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight, ArrowUpRight, Bell, BookOpen, Check, CheckCircle2, ChevronRight, Clapperboard,
  Clock3, Copy, ExternalLink, Film, FolderOpen, Heart, Info, KeyRound, LayoutDashboard,
  Lightbulb, LoaderCircle, LockKeyhole, LogOut, Menu, Mic2, MoreHorizontal, Palette, Play, Plus,
  Search, Send, Settings2, ShieldCheck, Sparkles, Trash2, TvMinimalPlay, Video, WandSparkles, X,
} from "lucide-react";
import Editor from "@/components/Editor";
import DiscoveryHub from "@/components/DiscoveryHub";
import AIChat from "@/components/AIChat";
import SettingsIntegrations from "@/components/SettingsIntegrations";
import AgentStudio from "@/components/AgentStudio";
import { renderProjectVideo } from "@/lib/render";
import { apiRequest, jsonRequest } from "@/lib/client-api";
import { CATEGORIES, CHARACTERS, IDEA_PROMPTS, type AutoSettings, type Character, type StudioConfig, type StudioProject, type ViewName } from "@/lib/types";

type View = ViewName;
type AuthMode = "setup" | "locked" | "authenticated";
type Toast = { message: string; kind: "success" | "error" | "info" } | null;

type Props = { initialProjects: StudioProject[]; initialAuth: AuthMode; initialConfig: StudioConfig };

const NAV: { label: string; view: View; icon: typeof LayoutDashboard; group: string }[] = [
  { label: "Overview", view: "overview", icon: LayoutDashboard, group: "WORKSPACE" },
  { label: "Create + edit", view: "assistant", icon: WandSparkles, group: "WORKSPACE" },
  { label: "Shorts Agent", view: "agent", icon: Clapperboard, group: "WORKSPACE" },
  { label: "My projects", view: "projects", icon: FolderOpen, group: "WORKSPACE" },
  { label: "Daily auto hub", view: "discover", icon: Film, group: "EXPLORE" },
  { label: "Content ideas", view: "ideas", icon: Lightbulb, group: "EXPLORE" },
  { label: "Publish queue", view: "queue", icon: Send, group: "EXPLORE" },
  { label: "Settings", view: "settings", icon: Settings2, group: "ACCOUNT" },
];

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function categoryColor(category: string) {
  if (["Ocean", "Animals"].includes(category)) return "mint";
  if (["Space", "Bedtime"].includes(category)) return "lavender";
  if (["Learning", "Dinosaurs"].includes(category)) return "yellow";
  return "peach";
}

function ProjectCard({ project, onOpen, onDuplicate, onDelete }: { project: StudioProject; onOpen: () => void; onDuplicate: () => void; onDelete: () => void }) {
  const [menuOpen, setMenuOpen] = useState(false);
  return (
    <article className="project-card">
      <button className="project-visual" onClick={onOpen} aria-label={`Open ${project.title}`}>
        <img src={project.thumbnail || "/images/thumb-fox.png"} alt="" />
        <span className={`visual-status ${project.status}`}>{project.status === "published" ? "Published" : project.status === "ready" ? "Ready to share" : "In progress"}</span>
        <span className="visual-play"><Play size={19} fill="currentColor" /></span>
        <span className="visual-duration"><Clock3 size={12} /> {project.duration}s</span>
      </button>
      <div className="project-card-bottom">
        <div className="project-card-title-row"><button className="project-title-button" onClick={onOpen}>{project.title}</button><div className="card-menu-wrap"><button className="card-more" onClick={() => setMenuOpen((open) => !open)} aria-label={`More options for ${project.title}`}><MoreHorizontal size={19} /></button>{menuOpen && <div className="card-menu"><button onClick={() => { setMenuOpen(false); onDuplicate(); }}><Copy size={14} /> Duplicate</button><button className="danger" onClick={() => { setMenuOpen(false); onDelete(); }}><Trash2 size={14} /> Delete</button></div>}</div></div>
        <div className="project-card-meta"><span className={`category-dot ${categoryColor(project.category)}`} /> {project.category} <span className="meta-separator">·</span> {project.scenes.length} scenes <span className="meta-separator">·</span> {formatDate(project.updatedAt)}</div>
      </div>
    </article>
  );
}

export default function Studio({ initialProjects, initialAuth, initialConfig }: Props) {
  const [mode, setMode] = useState<AuthMode>(initialAuth);
  const [projects, setProjects] = useState<StudioProject[]>(initialProjects);
  const [config, setConfig] = useState<StudioConfig>(initialConfig);
  const [view, setView] = useState<View>("assistant");
  const [activeId, setActiveId] = useState<string | null>(initialProjects[0]?.id ?? null);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("All projects");
  const [idea, setIdea] = useState("");
  const [category, setCategory] = useState("Adventure");
  const [ageGroup, setAgeGroup] = useState("3–5 years");
  const [duration, setDuration] = useState(30);
  const [style, setStyle] = useState("Storybook");
  const [character, setCharacter] = useState<Character>("fox");
  const [generating, setGenerating] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [mobileMenu, setMobileMenu] = useState(false);
  const [toast, setToast] = useState<Toast>(null);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    setOrigin(window.location.origin);
    const status = new URLSearchParams(window.location.search).get("youtube");
    if (status) {
      setView("settings");
      if (status === "connected") setToast({ message: "Your YouTube channel is connected!", kind: "success" });
      else if (status === "configure") setToast({ message: "Add Google OAuth credentials in your server environment first.", kind: "info" });
      else if (status === "cancelled") setToast({ message: "YouTube connection was cancelled.", kind: "info" });
      else setToast({ message: "Could not connect YouTube. Check your OAuth settings and try again.", kind: "error" });
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5500);
    return () => clearTimeout(timer);
  }, [toast]);

  const autopilotPumped = useRef(false);
  useEffect(() => {
    if (mode !== "authenticated" || autopilotPumped.current) return;
    autopilotPumped.current = true;
    let cancelled = false;
    (async () => {
      try {
        const status = await apiRequest<{ auto: AutoSettings; pending: { id: string; title: string; hasRender: boolean }[]; youtubeConnected: boolean }>("/api/autopilot");
        if (cancelled || !status.pending.length) return;
        const item = status.pending.find((entry) => !entry.hasRender) || status.pending[0];
        const projectId = item.id;
        if (!item.hasRender) {
          notify(`Auto-pilot made today’s Short: ${item.title}. Rendering it now…`, "info");
          const data = await apiRequest<{ project: StudioProject }>(`/api/projects/${projectId}`);
          if (cancelled) return;
          const blob = await renderProjectVideo(data.project, () => undefined);
          const form = new FormData();
          form.set("action", "render");
          form.set("projectId", projectId);
          form.set("video", new File([blob], "autopilot-short.webm", { type: "video/webm" }));
          await apiRequest("/api/autopilot", { method: "POST", body: form });
          if (cancelled) return;
          setProjects((current) => [data.project, ...current.filter((entry) => entry.id !== projectId)]);
          setActiveId(projectId);
          setView("assistant");
          notify("Today’s Short is rendered and open below.", "success");
        }
        if (status.auto.autoPost && status.youtubeConnected) {
          const published = await apiRequest<{ url: string }>("/api/autopilot", jsonRequest({ action: "publish", projectId }));
          if (!cancelled) notify(`Auto-pilot posted it to YouTube: ${published.url}`, "success");
        } else if (item.hasRender || !status.auto.autoPost) {
          // Rendered but waiting for a human review before posting.
        }
      } catch (error) {
        if (!cancelled) notify(error instanceof Error ? error.message : "Autopilot needs attention.", "error");
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  async function refreshConfig() {
    try {
      const data = await apiRequest<{ config: StudioConfig }>("/api/config");
      setConfig(data.config);
    } catch { /* keep current flags */ }
  }

  const sortedProjects = useMemo(() => [...projects].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()), [projects]);
  const readyCount = projects.filter((project) => project.status === "ready").length;
  const publishedCount = projects.filter((project) => project.status === "published").length;
  const sceneCount = projects.reduce((sum, project) => sum + project.scenes.length, 0);
  const activeProject = projects.find((project) => project.id === activeId);

  function notify(message: string, kind: "success" | "error" | "info" = "info") { setToast({ message, kind }); }
  function requireAccess() {
    if (mode === "authenticated") return true;
    if (mode === "setup") { setShowSetup(true); setAuthError(""); }
    else notify("Unlock your private studio to continue.", "info");
    return false;
  }
  function goTo(next: View) { setView(next); setMobileMenu(false); window.scrollTo({ top: 0, behavior: "smooth" }); }
  function openProject(project: StudioProject) { setActiveId(project.id); goTo("editor"); }
  function savedProject(project: StudioProject) { setProjects((current) => current.map((item) => item.id === project.id ? project : item)); }
  function openCreatedProject(project: StudioProject) {
    setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
    setActiveId(project.id);
    goTo("editor");
  }
  function openInChatEditor(project: StudioProject) {
    setProjects((current) => [project, ...current.filter((item) => item.id !== project.id)]);
    setActiveId(project.id);
    setView("assistant");
    setMobileMenu(false);
    window.setTimeout(() => document.getElementById("edit-below")?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
  }
  async function openProjectById(projectId: string) {
    try {
      const data = await apiRequest<{ project: StudioProject }>(`/api/projects/${projectId}`);
      openCreatedProject(data.project);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not open that project.", "error");
    }
  }
  async function openProjectBelow(projectId: string) {
    try {
      const data = await apiRequest<{ project: StudioProject }>(`/api/projects/${projectId}`);
      openInChatEditor(data.project);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Could not open that project.", "error");
    }
  }
  function useIdea(value: string, nextCategory: string) { setIdea(value); setCategory(nextCategory); goTo("create"); }

  async function submitAuth(action: "setup" | "login") {
    setAuthError("");
    if (pin.length < 6) { setAuthError("Use at least 6 characters for your PIN or passphrase."); return; }
    if (action === "setup" && pin !== confirmPin) { setAuthError("Your PINs don't match yet."); return; }
    setAuthBusy(true);
    try {
      const data = await apiRequest<{ mode: AuthMode; projects: StudioProject[] }>("/api/auth", jsonRequest({ action, pin }));
      setMode(data.mode); setProjects(data.projects); setShowSetup(false); setPin(""); setConfirmPin("");
      notify(action === "setup" ? "Your private studio is ready. Let's create!" : "Welcome back to your studio!", "success");
    } catch (error) { setAuthError(error instanceof Error ? error.message : "Could not unlock your studio."); }
    finally { setAuthBusy(false); }
  }

  async function logout() {
    try { await apiRequest("/api/auth", jsonRequest({ action: "logout" })); setMode("locked"); setProjects([]); setActiveId(null); setView("overview"); setPin(""); notify("Your studio is locked.", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : "Could not lock your studio.", "error"); }
  }

  async function generate() {
    if (!idea.trim() || idea.trim().length < 5) { notify("Give your story a little idea first (at least 5 characters).", "info"); return; }
    if (!requireAccess()) return;
    setGenerating(true);
    try {
      const data = await apiRequest<{ project: StudioProject; mode: "ai" | "offline"; note: string | null }>("/api/generate", jsonRequest({ idea, category, ageGroup, duration, style, character }));
      setProjects((current) => [data.project, ...current]);
      setActiveId(data.project.id); setView("editor");
      notify(data.mode === "ai" ? "Your AI storyboard is ready to make your own!" : data.note || "Your new storyboard is ready!", data.mode === "ai" ? "success" : "info");
    } catch (error) { notify(error instanceof Error ? error.message : "Could not create a story.", "error"); }
    finally { setGenerating(false); }
  }

  async function duplicate(project: StudioProject) {
    if (!requireAccess()) return;
    try { const data = await apiRequest<{ project: StudioProject }>("/api/projects", jsonRequest({ sourceId: project.id })); setProjects((current) => [data.project, ...current]); notify("A copy of your story is ready.", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : "Could not duplicate this story.", "error"); }
  }

  async function remove(project: StudioProject) {
    if (!requireAccess()) return;
    if (!window.confirm(`Delete “${project.title}”? This can't be undone.`)) return;
    try { await apiRequest(`/api/projects/${project.id}`, { method: "DELETE" }); setProjects((current) => current.filter((item) => item.id !== project.id)); notify("Project deleted.", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : "Could not delete this story.", "error"); }
  }

  async function disconnectYouTube() {
    if (!window.confirm("Disconnect your YouTube channel from this studio?")) return;
    try { await apiRequest("/api/youtube/disconnect", { method: "POST" }); setConfig((current) => ({ ...current, youtubeConnected: false, youtubeChannelTitle: null, youtubeChannelAvatar: null })); notify("YouTube channel disconnected.", "success"); }
    catch (error) { notify(error instanceof Error ? error.message : "Could not disconnect YouTube.", "error"); }
  }

  if (mode === "locked") {
    return (
      <main className="lock-layout">
        <div className="lock-illustration"><div className="lock-brand"><span className="brand-mark">✳</span><span>littleloop<span className="brand-dot">.</span></span></div><div className="lock-image" /><div className="lock-illustration-copy"><span>YOUR PRIVATE CREATIVE SPACE</span><h2>A little world of<br />big imagination.</h2><p>All your stories, scenes, and ideas are right where you left them.</p></div></div>
        <div className="lock-form-side"><div className="lock-form-card"><div className="lock-icon"><LockKeyhole size={23} /></div><p className="tiny-eyebrow">WELCOME BACK</p><h1>Unlock your studio</h1><p className="lock-subtitle">Your little stories are waiting for you.</p><form onSubmit={(event) => { event.preventDefault(); submitAuth("login"); }}><label className="field-label">Your PIN or passphrase<input className="field-input" type="password" value={pin} onChange={(event) => setPin(event.target.value)} autoFocus autoComplete="current-password" placeholder="Enter your private PIN" /></label>{authError && <p className="form-error">{authError}</p>}<button className="button button-primary auth-submit" type="submit" disabled={authBusy}>{authBusy ? <LoaderCircle size={18} className="spin" /> : <ArrowRight size={18} />} {authBusy ? "Unlocking…" : "Unlock studio"}</button></form><div className="lock-footer"><ShieldCheck size={16} /> Just for you. Your stories stay private.</div></div></div>
        {toast && <div className={`toast toast-${toast.kind}`} role="status">{toast.kind === "success" ? <CheckCircle2 size={18} /> : <Info size={18} />}{toast.message}<button onClick={() => setToast(null)} aria-label="Dismiss"><X size={15} /></button></div>}
      </main>
    );
  }

  const visibleProjects = sortedProjects.filter((project) => {
    const matchesSearch = `${project.title} ${project.category} ${project.idea}`.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === "All projects" || project.status === filter.toLowerCase();
    return matchesSearch && matchesFilter;
  });
  const currentViewLabel = view === "editor" ? "Story editor" : NAV.find((item) => item.view === view)?.label || "Overview";

  return (
    <div className="studio-shell">
      {mobileMenu && <button className="mobile-scrim" onClick={() => setMobileMenu(false)} aria-label="Close navigation" />}
      <aside className={`sidebar ${mobileMenu ? "sidebar-open" : ""}`}>
        <div className="sidebar-logo"><span className="brand-mark">✳</span><span>littleloop<span className="brand-dot">.</span></span><button className="mobile-close" onClick={() => setMobileMenu(false)} aria-label="Close menu"><X size={18} /></button></div>
        <div className="sidebar-nav">
          {["WORKSPACE", "EXPLORE", "ACCOUNT"].map((group) => <div className="nav-group" key={group}><div className="nav-group-label">{group}</div>{NAV.filter((item) => item.group === group).map(({ label, view: target, icon: Icon }) => <button key={target} className={`nav-item ${view === target || (view === "editor" && target === "projects") ? "active" : ""}`} onClick={() => goTo(target)}><Icon size={19} strokeWidth={2} /><span>{label}</span>{target === "queue" && readyCount > 0 && <em>{readyCount}</em>}</button>)}</div>)}
        </div>
        <div className="sidebar-bottom"><div className="sidebar-inspo"><span className="sidebar-inspo-star">✦</span><span className="sidebar-inspo-orbit">◌</span><h3>Make magic, one little story at a time.</h3><button onClick={() => goTo("create")}>Start creating <ArrowRight size={14} /></button></div><div className="sidebar-user"><span className="user-avatar">C</span><div><strong>My studio</strong><small>{mode === "setup" ? "Demo mode" : "Personal workspace"}</small></div><span className="online-dot" /></div></div>
      </aside>

      <div className="main-area">
        <header className="topbar"><div className="topbar-left"><button className="mobile-menu-button" onClick={() => setMobileMenu(true)} aria-label="Open navigation"><Menu size={22} /></button><div className="topbar-breadcrumb">Workspace <ChevronRight size={15} /> <strong>{currentViewLabel}</strong></div></div><div className="topbar-right"><div className="search-box"><Search size={17} /><input placeholder="Search projects..." value={search} onFocus={() => { if (view !== "editor") setView("projects"); }} onChange={(event) => { setSearch(event.target.value); if (view !== "editor") setView("projects"); }} aria-label="Search projects" /><kbd>⌘ K</kbd></div><button className="topbar-icon" title="Tips for creators" onClick={() => goTo("ideas")}><Bell size={19} /></button><button className="topbar-profile" title="Studio settings" onClick={() => goTo("settings")}>C</button></div></header>
        <main className={`content content-${view}`}>
          {mode === "setup" && view !== "editor" && <div className="setup-banner"><span className="setup-banner-icon"><LockKeyhole size={17} /></span><div><strong>Welcome to your demo studio</strong><span>Create your private PIN to save stories, generate scenes, and publish.</span></div><button onClick={() => { setShowSetup(true); setAuthError(""); }}>Set up my studio <ArrowRight size={15} /></button></div>}

          {view === "overview" && <>
            <div className="page-head dashboard-head"><div><p className="eyebrow"><span className="eyebrow-sun">✳</span> YOUR CREATIVE CORNER</p><h1>Good things start with <span>little stories.</span></h1><p>Dream it up, bring it to life, and share a little joy.</p></div><button className="button button-primary top-create" onClick={() => goTo("assistant")}><Plus size={19} /> Create a short</button></div>
            <div className="hero-banner"><div className="hero-copy"><div className="hero-label"><Sparkles size={14} /> THE STORY STARTS HERE</div><h2>Big ideas for little imaginations.</h2><p>Moving characters, expressive voices and your own little world. Let&apos;s make a cartoon they&apos;ll love.</p><button onClick={() => goTo("assistant")}>Let&apos;s make a story <ArrowRight size={17} /></button></div></div>
            <div className="stats-grid"><div className="stat-card"><span className="stat-icon stat-lavender"><Film size={20} /></span><div><strong>{String(projects.length).padStart(2, "0")}</strong><span>Total projects</span></div><span className="stat-sparkle">✧</span></div><div className="stat-card"><span className="stat-icon stat-peach"><Clapperboard size={20} /></span><div><strong>{String(sceneCount).padStart(2, "0")}</strong><span>Scenes created</span></div><span className="stat-sparkle">✧</span></div><div className="stat-card"><span className="stat-icon stat-yellow"><Sparkles size={20} /></span><div><strong>{String(readyCount).padStart(2, "0")}</strong><span>Ready to share</span></div><span className="stat-sparkle">✧</span></div><div className="stat-card"><span className="stat-icon stat-mint"><CheckCircle2 size={20} /></span><div><strong>{String(publishedCount).padStart(2, "0")}</strong><span>Published</span></div><span className="stat-sparkle">✧</span></div></div>
            <div className="section-heading"><div><p className="section-overline">PICK UP WHERE YOU LEFT OFF</p><h2>Recent creations <span className="heading-sparkle">✳</span></h2></div><button className="section-link" onClick={() => goTo("projects")}>View all projects <ArrowRight size={17} /></button></div>
            <div className="project-grid">{sortedProjects.slice(0, 3).map((project) => <ProjectCard key={project.id} project={project} onOpen={() => openProject(project)} onDuplicate={() => duplicate(project)} onDelete={() => remove(project)} />)}{projects.length === 0 && <div className="empty-state"><Sparkles size={30} /><h3>Your first story is waiting</h3><p>Start with any little idea and bring it to life.</p><button className="button button-primary" onClick={() => goTo("create")}>Create a short</button></div>}</div>
            <div className="bottom-inspiration"><span>✦</span><p>Little reminder: every wonderful story begins with just one idea.</p><button onClick={() => goTo("ideas")}>Find inspiration <ArrowUpRight size={15} /></button></div>
          </>}

          {view === "create" && <>
            <div className="page-head"><div><p className="eyebrow"><span className="eyebrow-sun">✳</span> THE CREATION STATION</p><h1>Let&apos;s make a <span>little magic.</span></h1><p>Tell us what you&apos;re imagining. We&apos;ll help shape the story.</p></div></div>
            <div className="create-layout"><div className="create-form panel"><div className="form-step-heading"><span>01</span><div><p className="tiny-eyebrow">START WITH A SPARK</p><h2>What&apos;s your story about?</h2></div></div><label className="field-label idea-field">Your idea<textarea className="field-input idea-textarea" placeholder="A curious fox finds a glowing firefly who needs help getting home..." value={idea} onChange={(event) => setIdea(event.target.value)} rows={4} maxLength={350} /><span className="field-hint">Anything goes: an animal, a lesson, a tiny adventure... <em>{idea.length}/350</em></span></label><div className="idea-suggestions"><span>TRY AN IDEA</span>{IDEA_PROMPTS.slice(0, 3).map((prompt) => <button key={prompt.title} onClick={() => { setIdea(prompt.title); setCategory(prompt.category); }}>{prompt.emoji} {prompt.title}</button>)}</div>
              <div className="form-divider" /><div className="form-step-heading"><span>02</span><div><p className="tiny-eyebrow">MAKE IT YOURS</p><h2>Set the scene</h2></div></div>
              <div className="form-two-cols"><label className="field-label">Story category<select className="field-input field-select" value={category} onChange={(event) => setCategory(event.target.value)}>{CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label><label className="field-label">Age group<select className="field-input field-select" value={ageGroup} onChange={(event) => setAgeGroup(event.target.value)}>{["2–4 years", "3–5 years", "5–7 years", "7–9 years"].map((item) => <option key={item}>{item}</option>)}</select></label></div>
              <div className="field-label">Short length <span className="field-label-soft">vertical 9:16</span><div className="choice-row">{[15, 20, 30, 45].map((value) => <button key={value} className={duration === value ? "selected" : ""} onClick={() => setDuration(value)}>{value}s</button>)}</div></div>
              <div className="field-label">Art direction<div className="choice-row style-row">{["Storybook", "Claymation", "Colorful flat", "Dreamy pastel"].map((value) => <button key={value} className={style === value ? "selected" : ""} onClick={() => setStyle(value)}>{value}</button>)}</div></div>
              <div className="field-label">Choose your main character<div className="character-grid">{CHARACTERS.map((item) => <button key={item.value} className={character === item.value ? "selected" : ""} onClick={() => setCharacter(item.value)}><span>{item.emoji}</span>{item.label}</button>)}</div></div>
              <button className="button button-primary generate-button" onClick={generate} disabled={generating}>{generating ? <LoaderCircle size={19} className="spin" /> : <WandSparkles size={19} />}{generating ? "Dreaming up your story…" : "Generate my storyboard"}<ArrowRight size={18} /></button><p className="generate-footnote"><ShieldCheck size={14} /> Original, child-friendly stories. Always review before publishing.</p>
            </div><aside className="create-aside"><div className="create-inspiration-card"><img src="/images/thumb-space.png" alt="A friendly cartoon astronaut bear floating in space" /><div><span>✦ A LITTLE INSPIRATION</span><h3>Every big story begins with a tiny “what if?”</h3></div></div><div className="how-card panel"><p className="tiny-eyebrow">YOUR CREATIVE JOURNEY</p><h3>From idea to "wow!"</h3><div className="how-step"><span>01</span><div><strong>Dream it up</strong><p>Tell us your idea, characters, and vibe.</p></div></div><div className="how-step"><span>02</span><div><strong>Make it yours</strong><p>Animate each scene, add a voice and edit the timeline.</p></div></div><div className="how-step"><span>03</span><div><strong>Share the joy</strong><p>Export a Short or upload to your channel.</p></div></div></div><div className="provider-note"><Sparkles size={17} /><p>{config.openRouterConfigured ? "Free OpenRouter models are ready to help write your story." : "No AI key? No problem. The built-in story maker still works, and you can add a free OpenRouter key later."}</p></div></aside></div>
          </>}

          {view === "projects" && <>
            <div className="page-head"><div><p className="eyebrow"><span className="eyebrow-sun">✳</span> YOUR STORY SHELF</p><h1>My <span>projects.</span></h1><p>All your little masterpieces, together in one place.</p></div><button className="button button-primary top-create" onClick={() => goTo("create")}><Plus size={18} /> New short</button></div>
            <div className="library-toolbar"><div className="filter-tabs">{["All projects", "Draft", "Ready", "Published"].map((item) => <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}{item === "All projects" && <span>{projects.length}</span>}</button>)}</div><span className="library-count">{visibleProjects.length} {visibleProjects.length === 1 ? "story" : "stories"}</span></div>
            {visibleProjects.length ? <div className="project-grid library-grid">{visibleProjects.map((project) => <ProjectCard key={project.id} project={project} onOpen={() => openProject(project)} onDuplicate={() => duplicate(project)} onDelete={() => remove(project)} />)}</div> : <div className="empty-state large-empty"><FolderOpen size={33} /><h3>No stories found</h3><p>Try a different search or start something new.</p><button className="button button-primary" onClick={() => { setSearch(""); setFilter("All projects"); goTo("create"); }}>Create a short</button></div>}
          </>}

          {view === "agent" && <AgentStudio notify={notify} requireAccess={requireAccess} />}

          {view === "discover" && <DiscoveryHub config={config} requireAccess={requireAccess} notify={notify} onProjectCreated={openCreatedProject} />}

          {view === "assistant" && <>
            <AIChat config={config} requireAccess={requireAccess} notify={notify} onOpenProject={openInChatEditor} onOpenProjectById={openProjectBelow} onGo={goTo} />
            <section className="edit-below" id="edit-below">
              <div className="edit-below-label"><span>EDIT SECTION</span><small>right below your chat — cut scenes, add voices, export</small></div>
              {activeProject ? <Editor key={activeProject.id} project={activeProject} config={config} onBack={() => goTo("projects")} onSaved={savedProject} onGoSettings={() => goTo("settings")} notify={notify} requireAccess={requireAccess} /> : <div className="edit-below-empty panel"><Clapperboard size={30} /><h3>Your editor will appear here</h3><p>Ask the chat above to “generate a video” — it loads in this section automatically, ready to edit and export.</p><button className="button button-primary" onClick={() => window.scrollTo({ top: 0, behavior: "smooth" })}>Ask the chat above <ArrowRight size={16} /></button></div>}
            </section>
          </>}

          {view === "ideas" && <>
            <div className="page-head"><div><p className="eyebrow"><span className="eyebrow-sun">✳</span> FOR THE CURIOUS MIND</p><h1>A little <span>inspiration.</span></h1><p>Don&apos;t know where to start? One of these might spark something wonderful.</p></div></div>
            <div className="ideas-intro"><div><span className="hero-label"><Lightbulb size={15} /> THE IDEA JAR</span><h2>Pick a spark. Make it yours.</h2><p>Tap an idea to bring it into the story builder. Change anything you like!</p></div><span className="ideas-intro-art">✳</span></div>
            <div className="ideas-grid">{IDEA_PROMPTS.map((prompt, index) => <button className={`idea-card idea-${prompt.color}`} key={prompt.title} onClick={() => useIdea(prompt.title, prompt.category)}><span className="idea-card-top"><span>{String(index + 1).padStart(2, "0")} / IDEA</span><ArrowUpRight size={18} /></span><span className="idea-emoji">{prompt.emoji}</span><span className="idea-category">{prompt.category}</span><strong>{prompt.title}</strong><small>{prompt.description}</small><span className="idea-cta">Use this idea <ArrowRight size={15} /></span></button>)}</div>
            <div className="custom-idea-strip"><div><Sparkles size={22} /><span><strong>Have an idea of your own?</strong><small>That&apos;s even better. We can help you bring it to life.</small></span></div><button className="button button-primary" onClick={() => goTo("create")}>Start from scratch <ArrowRight size={16} /></button></div>
          </>}

          {view === "queue" && <>
            <div className="page-head"><div><p className="eyebrow"><span className="eyebrow-sun">✳</span> ALMOST SHOWTIME</p><h1>Publish <span>queue.</span></h1><p>Your finished stories are ready for their next adventure.</p></div></div>
            <div className="queue-layout"><div><div className="section-heading queue-heading"><div><p className="section-overline">READY WHEN YOU ARE</p><h2>Ready to share <span className="queue-count">{readyCount}</span></h2></div></div>{projects.filter((item) => item.status === "ready").length ? <div className="queue-list">{sortedProjects.filter((item) => item.status === "ready").map((project) => <div className="queue-item" key={project.id}><img src={project.thumbnail || "/images/thumb-fox.png"} alt="" /><div><span className="queue-item-tag">READY TO SHARE</span><h3>{project.title}</h3><p>{project.category} · {project.duration}s · {project.scenes.length} scenes</p></div><button className="button button-outline" onClick={() => openProject(project)}>Review & publish <ArrowRight size={16} /></button></div>)}</div> : <div className="empty-state queue-empty"><Clapperboard size={30} /><h3>Nothing in the queue yet</h3><p>Mark a finished story as ready in the editor.</p><button onClick={() => goTo("projects")}>Browse projects <ArrowRight size={15} /></button></div>}
            <div className="section-heading queue-heading published-section"><div><p className="section-overline">OUT IN THE WORLD</p><h2>Published stories <span className="queue-count">{publishedCount}</span></h2></div></div>{sortedProjects.filter((item) => item.status === "published").map((project) => <div className="queue-item" key={project.id}><img src={project.thumbnail || "/images/thumb-fox.png"} alt="" /><div><span className="queue-item-tag published">PUBLISHED</span><h3>{project.title}</h3><p>{project.category} · {project.duration}s</p></div>{project.youtubeVideoId && <a className="button button-outline" href={`https://www.youtube.com/watch?v=${project.youtubeVideoId}`} target="_blank" rel="noopener noreferrer">View video <ExternalLink size={15} /></a>}</div>)}{publishedCount === 0 && <p className="queue-none-published">Your published stories will appear here. ✨</p>}</div><aside className="queue-guide panel"><span className="guide-top-icon"><TvMinimalPlay size={24} /></span><h3>Share with care</h3><p>A simple checklist before your little story meets the world.</p><div><CheckCircle2 size={17} /><span>Watch the full preview</span></div><div><CheckCircle2 size={17} /><span>Review the words and pictures</span></div><div><CheckCircle2 size={17} /><span>Set visibility (private by default)</span></div><div><CheckCircle2 size={17} /><span>Confirm it&apos;s made for kids</span></div><button onClick={() => goTo("settings")}>YouTube connection <ArrowRight size={15} /></button></aside></div>
          </>}

          {view === "settings" && <>
            <div className="page-head"><div><p className="eyebrow"><span className="eyebrow-sun">✳</span> THE LITTLE DETAILS</p><h1>Studio <span>settings.</span></h1><p>A home for your connections, creative tools, and privacy.</p></div></div>
            <div className="settings-layout"><div className="settings-main"><SettingsIntegrations notify={notify} refreshConfig={refreshConfig} /><section className="settings-card panel"><div className="settings-card-icon settings-purple"><LockKeyhole size={21} /></div><div className="settings-card-content"><div className="settings-title-row"><h2>Private workspace</h2><span className={`connection-badge ${mode === "authenticated" ? "connected" : "not-connected"}`}>{mode === "authenticated" ? "Protected" : "Not set up"}</span></div><p>Just for you. Your stories and connected channel are protected by your PIN and a private session.</p>{mode === "authenticated" ? <button className="settings-link" onClick={logout}><LogOut size={16} /> Lock this studio</button> : <button className="settings-link" onClick={() => setShowSetup(true)}><KeyRound size={16} /> Create your private PIN</button>}</div></section>
              <section className="settings-card panel"><div className="settings-card-icon settings-peach"><WandSparkles size={21} /></div><div className="settings-card-content"><div className="settings-title-row"><h2>AI story writer</h2><span className={`connection-badge ${config.openRouterConfigured ? "connected" : "not-connected"}`}>{config.openRouterConfigured ? "Ready" : "Optional"}</span></div><p>Write original storyboards with OpenRouter&apos;s free-model router. Without a key, the built-in story maker keeps working.</p><div className="env-instruction"><span>SERVER ENVIRONMENT VARIABLE</span><code>OPENROUTER_API_KEY</code></div><a className="settings-link" href="https://openrouter.ai/keys" target="_blank" rel="noopener noreferrer">Get an OpenRouter key <ExternalLink size={15} /></a></div></section>
              <section className="settings-card panel"><div className="settings-card-icon settings-mint"><Palette size={21} /></div><div className="settings-card-content"><div className="settings-title-row"><h2>Pollinations art, video & narration</h2><span className={`connection-badge ${config.pollinationsConfigured ? "connected" : "not-connected"}`}>{config.pollinationsConfigured ? "Ready" : "Optional"}</span></div><p>Make background artwork, short AI video clips, and Kokoro character voices through Pollinations. Its current media models may require credits. The built-in animated cartoons and music always work without a key.</p><div className="env-instruction"><span>SERVER ENVIRONMENT VARIABLE</span><code>POLLINATIONS_API_KEY</code></div><a className="settings-link" href="https://enter.pollinations.ai/" target="_blank" rel="noopener noreferrer">Explore Pollinations <ExternalLink size={15} /></a></div></section>
              <section className="settings-card panel"><div className="settings-card-icon settings-mint"><Film size={21} /></div><div className="settings-card-content"><div className="settings-title-row"><h2>Pexels stock video browser</h2><span className={`connection-badge ${config.pexelsConfigured ? "connected" : "not-connected"}`}>{config.pexelsConfigured ? "Ready" : "Optional"}</span></div><p>Browse and download royalty-free nature and animal MP4 clips inside the Daily Auto Hub. The key is kept server-side; clips pass through a whitelisted media proxy for preview and export.</p><div className="env-instruction"><span>SERVER ENVIRONMENT VARIABLE</span><code>PEXELS_API_KEY</code></div><a className="settings-link" href="https://www.pexels.com/api/" target="_blank" rel="noopener noreferrer">Get a free Pexels key <ExternalLink size={15} /></a></div></section>
              <section className="settings-card panel"><div className="settings-card-icon settings-yellow"><Video size={21} /></div><div className="settings-card-content"><div className="settings-title-row"><h2>Pixabay stock video browser</h2><span className={`connection-badge ${config.pixabayConfigured ? "connected" : "not-connected"}`}>{config.pixabayConfigured ? "Ready" : "Optional"}</span></div><p>Safe-search vertical-friendly clips with a free Pixabay developer key. Source and creator details are shown before you auto-edit a Short.</p><div className="env-instruction"><span>SERVER ENVIRONMENT VARIABLE</span><code>PIXABAY_API_KEY</code></div><a className="settings-link" href="https://pixabay.com/service/about/api/" target="_blank" rel="noopener noreferrer">Get a free Pixabay key <ExternalLink size={15} /></a></div></section>
              <section className="settings-card panel"><div className="settings-card-icon settings-purple"><Mic2 size={21} /></div><div className="settings-card-content"><div className="settings-title-row"><h2>Lifelike character voices</h2><span className={`connection-badge ${config.elevenLabsConfigured ? "connected" : "not-connected"}`}>{config.elevenLabsConfigured ? "Ready" : "Optional"}</span></div><p>ElevenLabs lets you choose from voices available in your account and save natural narration to each scene. Its free plan is for personal/non-commercial use; a monetized YouTube channel requires a plan with commercial rights. For a no-key option, record or upload your own voice in the editor.</p><div className="env-instruction"><span>SERVER ENVIRONMENT VARIABLE</span><code>ELEVENLABS_API_KEY</code></div><a className="settings-link" href="https://elevenlabs.io/docs/overview/capabilities/text-to-speech" target="_blank" rel="noopener noreferrer">Read ElevenLabs voice guide <ExternalLink size={15} /></a></div></section>
               <section className="settings-card panel youtube-settings"><div className="settings-card-icon settings-red"><TvMinimalPlay size={21} /></div><div className="settings-card-content"><div className="settings-title-row"><h2>YouTube channel</h2><span className={`connection-badge ${config.youtubeConnected ? "connected" : "not-connected"}`}>{config.youtubeConnected ? "Connected" : "Not connected"}</span></div><p>Connect your own channel securely with Google. You review and approve every upload — nothing publishes automatically in the background.</p>{config.youtubeConnected ? <div className="connected-channel">{config.youtubeChannelAvatar ? <img src={config.youtubeChannelAvatar} alt="Channel avatar" /> : <span><TvMinimalPlay size={22} /></span>}<div><strong>{config.youtubeChannelTitle || "Your YouTube channel"}</strong><small>Ready to upload Shorts</small></div><CheckCircle2 size={18} /></div> : <div className="youtube-setup-steps"><div><span>1</span> Enable YouTube Data API v3 in Google Cloud.</div><div><span>2</span> Create a Web OAuth client and set the redirect URI:</div><code>{origin ? `${origin}/api/youtube/callback` : "/api/youtube/callback"}</code><div><span>3</span> Add these server environment variables:</div><code>GOOGLE_CLIENT_ID &nbsp; GOOGLE_CLIENT_SECRET</code></div>}<div className="settings-action-row">{config.youtubeConnected ? <button className="button button-outline" onClick={disconnectYouTube}>Disconnect channel</button> : config.youtubeConfigured && mode === "authenticated" ? <a className="button button-primary" href="/api/youtube/connect"><TvMinimalPlay size={17} /> Connect YouTube <ArrowRight size={16} /></a> : <button className="button button-primary" onClick={() => notify(mode !== "authenticated" ? "Set up your private studio first." : "Add Google OAuth credentials to your server environment first.", "info")}><TvMinimalPlay size={17} /> Connect YouTube <ArrowRight size={16} /></button>}<a className="settings-link" href="https://console.cloud.google.com/apis/library/youtube.googleapis.com" target="_blank" rel="noopener noreferrer">Google Cloud guide <ExternalLink size={14} /></a></div></div></section>
            </div><aside className="settings-side"><div className="settings-tip panel"><span>✦</span><h3>Made for the little ones.</h3><p>Always watch the finished video and check YouTube&apos;s made-for-kids setting before sharing.</p><div><ShieldCheck size={17} /> Private by default</div><div><Heart size={17} /> Kind, original stories</div><div><BookOpen size={17} /> You stay in control</div></div><div className="settings-honesty panel"><Info size={19} /><p><strong>About “free AI”</strong><br />Arena is a comparison website, not a public video-generation API. This studio's animation, music and your own recordings work without AI credits. Optional AI media providers have changing quotas, costs and usage rights.</p></div></aside></div>
          </>}

          {view === "editor" && activeProject && <Editor key={activeProject.id} project={activeProject} config={config} onBack={() => goTo("projects")} onSaved={savedProject} onGoSettings={() => goTo("settings")} notify={notify} requireAccess={requireAccess} />}
        </main>
        <footer className="app-footer"><span>✳ littleloop studio</span><span>Made with imagination, for little imaginations. <Heart size={13} fill="currentColor" /></span></footer>
      </div>

      {showSetup && mode === "setup" && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowSetup(false); }}><div className="setup-modal" role="dialog" aria-modal="true" aria-labelledby="setup-title"><button className="modal-close" onClick={() => setShowSetup(false)} aria-label="Close"><X size={18} /></button><div className="modal-icon"><LockKeyhole size={25} /></div><p className="tiny-eyebrow">JUST FOR YOU</p><h2 id="setup-title">Make this studio yours.</h2><p className="modal-description">Create a private PIN or passphrase. It protects your projects and future YouTube connection.</p><form onSubmit={(event) => { event.preventDefault(); submitAuth("setup"); }}><label className="field-label">Create a PIN or passphrase<input className="field-input" type="password" minLength={6} value={pin} onChange={(event) => setPin(event.target.value)} placeholder="At least 6 characters" autoComplete="new-password" /></label><label className="field-label">Confirm your PIN<input className="field-input" type="password" value={confirmPin} onChange={(event) => setConfirmPin(event.target.value)} placeholder="One more time" autoComplete="new-password" /></label>{authError && <p className="form-error">{authError}</p>}<button className="button button-primary auth-submit" type="submit" disabled={authBusy}>{authBusy ? <LoaderCircle size={17} className="spin" /> : <ArrowRight size={17} />} {authBusy ? "Setting up…" : "Create my private studio"}</button></form><div className="modal-footnote"><ShieldCheck size={15} /> Your PIN is hashed. We never store it as plain text.</div></div></div>}
      {toast && <div className={`toast toast-${toast.kind}`} role="status">{toast.kind === "success" ? <CheckCircle2 size={18} /> : <Info size={18} />}<span>{toast.message}</span><button onClick={() => setToast(null)} aria-label="Dismiss"><X size={15} /></button></div>}
    </div>
  );
}
