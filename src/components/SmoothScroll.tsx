"use client";

import { useEffect, type ReactNode } from "react";
import Lenis from "lenis";
import {
  motion,
  useMotionValue,
  useScroll,
  useSpring,
  useMotionTemplate,
} from "framer-motion";

declare global {
  interface Window {
    __lenis?: Lenis;
  }
}

export default function SmoothScroll({ children }: { children: ReactNode }) {
  const { scrollYProgress } = useScroll();
  const progress = useSpring(scrollYProgress, { stiffness: 120, damping: 26, mass: 0.4 });

  const mx = useMotionValue(-600);
  const my = useMotionValue(-600);
  const sx = useSpring(mx, { stiffness: 60, damping: 20 });
  const sy = useSpring(my, { stiffness: 60, damping: 20 });
  const glow = useMotionTemplate`radial-gradient(420px circle at ${sx}px ${sy}px, rgba(124,108,255,0.09), transparent 70%)`;

  useEffect(() => {
    const lenis = new Lenis({ duration: 1.15, smoothWheel: true });
    window.__lenis = lenis;
    let raf = 0;
    const loop = (time: number) => {
      lenis.raf(time);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
      window.__lenis = undefined;
    };
  }, []);

  useEffect(() => {
    if (!window.matchMedia("(pointer: fine)").matches) return;
    const move = (e: MouseEvent) => {
      mx.set(e.clientX);
      my.set(e.clientY);
    };
    window.addEventListener("mousemove", move);
    return () => window.removeEventListener("mousemove", move);
  }, [mx, my]);

  return (
    <>
      {/* scroll progress */}
      <motion.div
        style={{ scaleX: progress }}
        className="fixed inset-x-0 top-0 z-[100] h-[2px] origin-left bg-gradient-to-r from-violet via-violet-soft to-lime"
      />
      {/* cursor aura */}
      <motion.div
        style={{ background: glow }}
        className="pointer-events-none fixed inset-0 z-[2] hidden md:block"
      />
      {children}
    </>
  );
}
