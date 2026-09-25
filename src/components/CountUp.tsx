"use client";

import { useEffect, useRef } from "react";
import { animate, useInView } from "framer-motion";

export default function CountUp({
  value,
  format = (v: number) => Math.round(v).toLocaleString("en-US"),
  suffix = "",
  prefix = "",
  duration = 2.2,
  className = "",
}: {
  value: number;
  format?: (v: number) => string;
  suffix?: string;
  prefix?: string;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });

  useEffect(() => {
    if (!inView || !ref.current) return;
    const controls = animate(0, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        if (ref.current) ref.current.textContent = `${prefix}${format(v)}${suffix}`;
      },
    });
    return () => controls.stop();
  }, [inView, value, duration, format, prefix, suffix]);

  return (
    <span ref={ref} className={className}>
      {prefix}0{suffix}
    </span>
  );
}
