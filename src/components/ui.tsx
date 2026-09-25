import type { ReactNode } from "react";

export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-11 w-11 rounded-xl" : "h-8 w-8 rounded-lg";
  const word = size === "lg" ? "text-2xl" : "text-lg";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className={`relative grid place-items-center border border-white/15 bg-ink ${box}`}>
        <svg viewBox="0 0 24 24" className={size === "lg" ? "h-6 w-6" : "h-4.5 w-4.5"} fill="none">
          <rect x="5" y="2.5" width="14" height="19" rx="4" stroke="url(#lg)" strokeWidth="2" />
          <path d="M10.5 8.8 L15.5 12 L10.5 15.2 Z" fill="url(#lg)" />
          <defs>
            <linearGradient id="lg" x1="0" y1="0" x2="24" y2="24">
              <stop offset="0" stopColor="#7C6CFF" />
              <stop offset="1" stopColor="#D9FF4D" />
            </linearGradient>
          </defs>
        </svg>
      </span>
      <span className={`font-display font-bold tracking-tight ${word}`}>
        Reel<span className="text-violet-soft">Forge</span>
      </span>
    </span>
  );
}

export function SectionTag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3.5 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-mute">
      <span className="h-1.5 w-1.5 rounded-full bg-lime" />
      {children}
    </span>
  );
}

export function SectionHead({
  tag,
  title,
  sub,
  align = "center",
}: {
  tag: string;
  title: ReactNode;
  sub?: string;
  align?: "center" | "left";
}) {
  const alignCls = align === "center" ? "items-center text-center" : "items-start text-left";
  return (
    <div className={`flex flex-col gap-5 ${alignCls}`}>
      <SectionTag>{tag}</SectionTag>
      <h2 className="max-w-3xl font-display text-4xl font-bold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
        {title}
      </h2>
      {sub ? <p className="max-w-xl text-base leading-relaxed text-mute sm:text-lg">{sub}</p> : null}
    </div>
  );
}

/* brand glyphs (stroke, minimal) */
export function YouTubeIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
      <path d="M10.5 9.5 L15 12 L10.5 14.5 Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TikTokIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M14.5 4v9.8a3.9 3.9 0 1 1-3.9-3.9" />
      <path d="M14.5 4c.4 2.6 2 4.3 4.8 4.6" />
    </svg>
  );
}

export function InstagramIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="3.5" width="17" height="17" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="0.9" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function XIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <path d="M4.5 4.5 L19.5 19.5" />
      <path d="M19.5 4.5 L4.5 19.5" />
    </svg>
  );
}

export function GithubIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56 0-.28-.01-1.02-.02-2-3.2.7-3.88-1.54-3.88-1.54-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.03 1.75 2.69 1.25 3.35.95.1-.74.4-1.25.72-1.53-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.04 0 0 .97-.31 3.18 1.18a11.1 11.1 0 0 1 5.79 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.58.23 2.75.11 3.04.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.35.78 1.05.78 2.12 0 1.53-.01 2.76-.01 3.14 0 .31.21.67.8.56A10.52 10.52 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5z" />
    </svg>
  );
}

export function Em({ children }: { children: ReactNode }) {
  return <em className="font-serif italic font-normal text-violet-soft">{children}</em>;
}

export function EmLime({ children }: { children: ReactNode }) {
  return <em className="font-serif italic font-normal text-lime">{children}</em>;
}
