"use client";

import type { CSSProperties } from "react";
import { SectionHead, Em } from "./ui";
import { TrendingUp } from "lucide-react";

const QUOTES = [
  {
    q: "I posted 90 shorts in 90 days without opening an editor once. My channel went from 400 subs to 61K.",
    name: "Maya K.",
    handle: "@cosmosdaily",
    stat: "+60.6K subs",
    c: "from-violet to-fuchsia-500",
  },
  {
    q: "The hooks are disgustingly good. Average view duration doubled the week I switched to ReelForge scripts.",
    name: "Jon D.",
    handle: "@moneyinaminute",
    stat: "2.1x retention",
    c: "from-lime to-emerald-500",
  },
  {
    q: "I run four faceless channels solo. ReelForge is the only reason that's a sentence I can say out loud.",
    name: "Priya S.",
    handle: "@darkhistoryfiles",
    stat: "4 channels",
    c: "from-sky-400 to-violet",
  },
  {
    q: "Auto-posting at 6 PM daily did more for my growth than any 'algorithm hack' I ever bought.",
    name: "Tom R.",
    handle: "@abyss.zone",
    stat: "+3.2M views",
    c: "from-amber-400 to-rose-500",
  },
  {
    q: "Voice Atlas narrates my Rome series. Comments keep asking which studio I hired. It's a checkbox.",
    name: "Elena V.",
    handle: "@empire.daily",
    stat: "812K followers",
    c: "from-fuchsia-500 to-violet",
  },
  {
    q: "Cloned my series into Spanish and German in one afternoon. International now, apparently.",
    name: "David O.",
    handle: "@neurobits",
    stat: "3 languages",
    c: "from-emerald-400 to-sky-500",
  },
  {
    q: "The virality score is scary accurate. Anything above 90 lands. I just stopped publishing below it.",
    name: "Sofia L.",
    handle: "@stoic.seconds",
    stat: "94 avg score",
    c: "from-rose-400 to-violet",
  },
  {
    q: "Quit my editing gig because my own channel now pays more. Built entirely in the forge.",
    name: "Marcus T.",
    handle: "@techfrontier",
    stat: "Full-time",
    c: "from-violet to-sky-400",
  },
];

function QuoteCard({ item }: { item: (typeof QUOTES)[number] }) {
  return (
    <div className="glass mx-2.5 flex w-[340px] shrink-0 flex-col justify-between rounded-3xl p-6">
      <p className="text-[15px] leading-relaxed text-cream/90">&ldquo;{item.q}&rdquo;</p>
      <div className="mt-6 flex items-center gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br text-xs font-bold text-void ${item.c}`}>
          {item.name.split(" ").map((w) => w[0]).join("")}
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{item.name}</p>
          <p className="truncate text-xs text-dim">{item.handle}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 rounded-full bg-lime/10 px-2.5 py-1 text-[10px] font-bold text-lime">
          <TrendingUp className="h-3 w-3" />
          {item.stat}
        </span>
      </div>
    </div>
  );
}

export default function Testimonials() {
  const rowA = QUOTES.slice(0, 4);
  const rowB = QUOTES.slice(4);
  return (
    <section className="relative overflow-hidden py-28 sm:py-36">
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <SectionHead
          tag="Receipts"
          title={
            <>
              Channels running on <Em>the forge</Em>
            </>
          }
          sub="Real creators, real posting streaks, zero cameras harmed."
        />
      </div>
      <div className="mask-fade-x mt-16 space-y-5">
        <div className="overflow-hidden">
          <div className="marquee-track" style={{ "--marquee-dur": "62s" } as CSSProperties}>
            {[...rowA, ...rowA].map((item, i) => (
              <QuoteCard key={`a-${i}`} item={item} />
            ))}
          </div>
        </div>
        <div className="overflow-hidden">
          <div className="marquee-track reverse" style={{ "--marquee-dur": "70s" } as CSSProperties}>
            {[...rowB, ...rowB].map((item, i) => (
              <QuoteCard key={`b-${i}`} item={item} />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
