import { Logo, TikTokIcon, YouTubeIcon, InstagramIcon, XIcon, GithubIcon } from "./ui";

const COLS = [
  {
    title: "Product",
    links: ["The Forge", "Voices", "Series Autopilot", "Rotation board", "Changelog"],
  },
  {
    title: "Resources",
    links: ["Niche finder", "Hook library", "Creator playbook", "API docs", "Status"],
  },
  {
    title: "Company",
    links: ["About", "Blog", "Careers", "Press kit", "Contact"],
  },
];

export default function Footer() {
  return (
    <footer className="relative overflow-hidden border-t border-white/[0.06]">
      <div className="mx-auto max-w-7xl px-5 pb-10 pt-16 sm:px-8">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr]">
          <div>
            <Logo size="lg" />
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-mute">
              The faceless video engine. Write, voice, render and publish — while you do literally
              anything else.
            </p>
            <div className="mt-6 flex gap-2.5">
              {[TikTokIcon, YouTubeIcon, InstagramIcon].map((Icon, i) => (
                <a
                  key={i}
                  href="#top"
                  aria-label="Social link"
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-mute transition hover:border-lime/50 hover:text-lime"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
              {[XIcon, GithubIcon].map((Icon, i) => (
                <a
                  key={`x-${i}`}
                  href="#top"
                  aria-label="Social link"
                  className="grid h-9 w-9 place-items-center rounded-full border border-white/10 text-mute transition hover:border-lime/50 hover:text-lime"
                >
                  <Icon className="h-4 w-4" />
                </a>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {COLS.map((col) => (
              <div key={col.title}>
                <p className="text-[11px] font-bold uppercase tracking-[0.22em] text-dim">{col.title}</p>
                <ul className="mt-4 space-y-2.5">
                  {col.links.map((l) => (
                    <li key={l}>
                      <a href="#top" className="text-sm text-mute transition hover:text-cream">
                        {l}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/[0.06] pt-8 text-xs text-dim sm:flex-row">
          <p>© 2026 ReelForge Labs. All rights reserved.</p>
          <p className="flex items-center gap-1.5">
            Built for the faceless era
            <span className="h-1.5 w-1.5 rounded-full bg-lime" />
          </p>
        </div>
      </div>

      {/* watermark */}
      <div aria-hidden className="pointer-events-none select-none overflow-hidden">
        <p className="text-stroke -mb-[4vw] text-center font-display text-[18vw] font-bold leading-none tracking-tight">
          REELFORGE
        </p>
      </div>
    </footer>
  );
}
