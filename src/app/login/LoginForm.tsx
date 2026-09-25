"use client";

import { motion } from "framer-motion";
import { KeyRound, ArrowRight, LockKeyholeOpen } from "lucide-react";

export default function LoginForm({
  error,
  requireKey,
}: {
  error?: string;
  requireKey?: boolean;
}) {
  return (
    <motion.form
      action="/api/auth/login"
      method="POST"
      animate={error ? { x: [0, -10, 10, -6, 6, 0] } : {}}
      transition={{ duration: 0.4 }}
      className="mt-7"
    >
      {requireKey && (
        <div className="mb-4 flex items-center gap-2 rounded-2xl border border-white/12 bg-white/[0.04] px-4 transition-colors focus-within:border-lime/50">
          <KeyRound className="h-4 w-4 shrink-0 text-dim" />
          <input
            type="password"
            name="password"
            placeholder="Forge key"
            autoFocus
            autoComplete="current-password"
            enterKeyHint="go"
            className="h-13 w-full bg-transparent text-sm text-cream outline-none placeholder:text-dim"
          />
        </div>
      )}
      {error && (
        <p className="mt-0 mb-3 text-xs text-red-400">Wrong key — the forge stays cold.</p>
      )}
      <button
        type="submit"
        className="btn-sheen pulse-ring flex h-14 w-full items-center justify-center gap-2.5 rounded-2xl bg-lime text-base font-bold text-void transition hover:brightness-110 active:scale-[0.98]"
      >
        <LockKeyholeOpen className="h-5 w-5" />
        Unlock studio <ArrowRight className="h-4 w-4" />
      </button>
      <p className="mt-4 text-[11px] leading-relaxed text-dim">
        {requireKey ? (
          <>
            Set <span className="font-mono text-mute">APP_PASSWORD</span> in your environment to
            change the key.
          </>
        ) : (
          <>Want a key later? Set <span className="font-mono text-mute">APP_PASSWORD</span> in env
          — this field appears automatically.</>
        )}
      </p>
    </motion.form>
  );
}
