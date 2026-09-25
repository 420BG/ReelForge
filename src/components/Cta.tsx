"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import { Camera, Zap, Infinity as InfinityIcon, ArrowRight } from "lucide-react";

export default function Cta() {
  return (
    <section className="relative overflow-hidden py-32 sm:py-44">
      <div className="bg-grid absolute inset-0 [mask-image:radial-gradient(ellipse_60%_60%_at_50%_50%,black,transparent)]" />
      <div className="aurora-a absolute left-1/2 top-1/2 h-[480px] w-[720px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-violet/20 blur-[160px]" />
      <div className="aurora-b absolute left-[30%] top-[30%] h-[300px] w-[300px] rounded-full bg-lime/[0.08] blur-[130px]" />

      <div className="relative mx-auto max-w-4xl px-5 text-center sm:px-8">
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-[11px] font-bold uppercase tracking-[0.3em] text-dim"
        >
          Your move
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.1, duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="mt-5 font-display text-5xl font-bold leading-[0.98] tracking-[-0.03em] sm:text-7xl"
        >
          Stop scrolling.
          <br />
          <em className="font-serif italic font-normal text-lime">Start posting.</em>
        </motion.h2>
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.2 }}
          className="mx-auto mt-6 max-w-lg text-lg text-mute"
        >
          The algorithm rewards whoever shows up daily. Show up daily without showing up at all.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3 }}
          className="mx-auto mt-10 max-w-xl"
        >
          <Link
            href="/studio"
            className="btn-sheen group inline-flex h-16 items-center gap-3 rounded-full bg-lime px-10 text-lg font-bold text-void transition hover:brightness-110"
          >
            Enter your studio
            <ArrowRight className="h-5 w-5 transition-transform group-hover:translate-x-1" />
          </Link>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-xs text-dim"
        >
          <span className="flex items-center gap-2">
            <Camera className="h-3.5 w-3.5 text-lime" /> No camera required
          </span>
          <span className="flex items-center gap-2">
            <Zap className="h-3.5 w-3.5 text-lime" /> Free AI providers only
          </span>
          <span className="flex items-center gap-2">
            <InfinityIcon className="h-3.5 w-3.5 text-lime" /> Runs forever, just for you
          </span>
        </motion.div>
      </div>
    </section>
  );
}
