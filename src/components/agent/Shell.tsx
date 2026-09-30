"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { AlertTriangle, CheckCircle2, LogOut } from "lucide-react";
import { useStudio } from "@/components/studio/StudioContext";
import { AgentDataProvider, useAgent } from "./data";
import { BrandMark, NavIcon } from "./ui";

const NAV = [
  { href: "/studio", label: "Home", icon: "home" },
  { href: "/studio/create", label: "Create", icon: "create" },
  { href: "/studio/chat", label: "AI Chat", icon: "chat" },
  { href: "/studio/autopilot", label: "Autopilot", icon: "autopilot" },
  { href: "/studio/videos", label: "My Videos", icon: "videos" },
  { href: "/studio/youtube", label: "YouTube", icon: "youtube" },
  { href: "/studio/settings", label: "Settings", icon: "settings" },
];
const MOBILE = ["/studio", "/studio/create", "/studio/autopilot", "/studio/videos", "/studio/settings"];

function isActive(pathname: string, href: string) {
  return href === "/studio" ? pathname === "/studio" : pathname.startsWith(href);
}

function Frame({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "/studio";
  const { toast, overview } = useAgent();
  const { autopilotActive, yt, logout } = useStudio();
  const running = overview?.jobs.length ?? 0;

  return (
    <div className="relative min-h-screen">
      <div className="bg-grid fixed inset-0 -z-10 [mask-image:radial-gradient(ellipse_80%_50%_at_50%_0%,black,transparent)]" />
      <div className="aurora-a fixed -top-40 left-[-10%] -z-10 h-[480px] w-[480px] rounded-full bg-violet/15 blur-[150px]" />

      {/* desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-white/[0.06] bg-void/80 px-4 py-6 backdrop-blur-xl lg:flex">
        <Link href="/studio" className="px-2"><BrandMark /></Link>
        <nav className="mt-9 flex flex-col gap-1">
          {NAV.map((item) => {
            const on = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${on ? "bg-lime/[0.1] text-lime ring-1 ring-lime/30" : "text-mute hover:bg-white/[0.04] hover:text-cream"}`}>
                <NavIcon name={item.icon} />{item.label}
                {item.href === "/studio/videos" && running > 0 && <span className="ml-auto rounded-full bg-violet/25 px-2 text-[10px] font-bold text-violet-soft">{running}</span>}
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto space-y-2">
          <div className="rounded-2xl border border-white/[0.07] bg-white/[0.02] p-3 text-[11px] text-mute">
            <p className="flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${autopilotActive ? "bg-lime" : "bg-dim"}`} />Autopilot {autopilotActive ? "running" : "paused"}</p>
            <p className="mt-1.5 flex items-center gap-2"><span className={`h-1.5 w-1.5 rounded-full ${yt.connected ? "bg-lime" : "bg-red-400"}`} />{yt.connected ? yt.channelTitle ?? "YouTube linked" : "YouTube not linked"}</p>
          </div>
          <Link href="/studio/classic" className="block px-3 text-[11px] font-semibold text-dim hover:text-mute">Classic studio →</Link>
          <button onClick={logout} className="flex items-center gap-2 px-3 text-[11px] font-semibold text-dim hover:text-cream"><LogOut className="h-3.5 w-3.5" /> Lock</button>
        </div>
      </aside>

      {/* top bar */}
      <header className="sticky top-0 z-30 border-b border-white/[0.06] bg-void/75 backdrop-blur-xl lg:ml-60">
        <div className="flex h-14 items-center justify-between px-4 sm:px-6">
          <Link href="/studio" className="lg:hidden"><BrandMark /></Link>
          <span className="hidden text-xs font-semibold text-dim lg:block">{NAV.find((item) => isActive(pathname, item.href))?.label ?? "Studio"}</span>
          <div className="flex items-center gap-2">
            {autopilotActive && <span className="hidden items-center gap-1.5 rounded-full border border-lime/30 px-2.5 py-1 text-[10px] font-bold text-lime sm:flex"><NavIcon name="bolt" className="h-3 w-3" />Auto-pilot</span>}
            <Link href="/studio/videos" aria-label="Activity" className="relative grid h-9 w-9 place-items-center rounded-full border border-white/10 text-mute hover:text-cream">
              <NavIcon name="bell" className="h-4 w-4" />
              {running > 0 && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-lime" />}
            </Link>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-violet/30 text-xs font-bold text-violet-soft">R</span>
          </div>
        </div>
      </header>

      {toast && (
        <div className={`glass-deep fixed left-1/2 top-16 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full px-5 py-3 text-sm font-semibold ${toast.kind === "error" ? "text-red-300" : "text-cream"}`}>
          {toast.kind === "error" ? <AlertTriangle className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4 text-lime" />}{toast.message}
        </div>
      )}

      <main className="px-4 pb-28 pt-6 sm:px-6 lg:ml-60 lg:pb-12">
        <div className="mx-auto max-w-6xl">{children}</div>
      </main>

      {/* mobile bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.07] bg-void/90 px-2 pb-[max(env(safe-area-inset-bottom),8px)] pt-2 backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5">
          {NAV.filter((item) => MOBILE.includes(item.href)).map((item) => {
            const on = isActive(pathname, item.href);
            return (
              <Link key={item.href} href={item.href} className={`flex flex-col items-center gap-1 py-1 text-[10px] font-semibold ${on ? "text-lime" : "text-dim"}`}>
                <NavIcon name={item.icon} className="h-5 w-5" />{item.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

export default function AgentShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  // The classic studio keeps its own full-page chrome.
  if (pathname.startsWith("/studio/classic")) return <>{children}</>;
  return (
    <AgentDataProvider>
      <Frame>{children}</Frame>
    </AgentDataProvider>
  );
}
