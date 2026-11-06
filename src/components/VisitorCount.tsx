"use client";

import { useEffect, useState } from "react";

const SEEN_KEY = "codeatlasx:visited";
const MIN_DIGITS = 4;

/** Unique-visitor counter: each browser is counted once (localStorage flag). Hidden if the counter is unavailable. */
export function VisitorCount() {
  const [count, setCount] = useState<number | null>(null);
  const [rolled, setRolled] = useState(false);

  useEffect(() => {
    let isNew = false;
    try {
      isNew = !localStorage.getItem(SEEN_KEY);
    } catch {}
    fetch("/api/visits", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ new: isNew }) })
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { count?: number } | null) => {
        if (typeof d?.count !== "number") return;
        if (isNew) {
          try {
            localStorage.setItem(SEEN_KEY, "1");
          } catch {}
        }
        setCount(d.count);
        // Paint the digits at 0 first, then roll them up to the real value.
        requestAnimationFrame(() => requestAnimationFrame(() => setRolled(true)));
      })
      .catch(() => {});
  }, []);

  if (count === null) return null;
  const digits = String(count).padStart(MIN_DIGITS, "0").split("");

  return (
    <div className="flex w-full items-center justify-center gap-4 text-xs text-muted" role="status">
      <span className="sr-only">
        This site has {count.toLocaleString()} {count === 1 ? "page visit" : "page visits"}
      </span>
      <span className="h-px max-w-24 flex-1 bg-gradient-to-r from-transparent to-line" aria-hidden />
      <span className="flex items-center gap-2.5" aria-hidden>
        <span>This site has</span>
        <span className="flex gap-[3px] rounded-lg bg-surface-2 p-[3px] ring-1 ring-line">
          {digits.map((d, i) => (
            <Digit key={i} value={rolled ? Number(d) : 0} delay={i * 120} />
          ))}
        </span>
        <span>{count === 1 ? "page visit" : "page visits"}</span>
      </span>
      <span className="h-px max-w-24 flex-1 bg-gradient-to-l from-transparent to-line" aria-hidden />
    </div>
  );
}

function Digit({ value, delay }: { value: number; delay: number }) {
  return (
    <span className="relative h-7 w-[22px] overflow-hidden rounded-[5px] bg-gradient-to-b from-foreground/85 to-foreground font-mono text-[15px] font-semibold tabular-nums text-background shadow-[0_1px_2px_rgba(0,0,0,0.25),inset_0_1px_0_rgba(255,255,255,0.12)]">
      <span
        className="absolute inset-x-0 top-0 flex flex-col transition-transform duration-[1200ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
        style={{ transform: `translateY(-${value * 10}%)`, transitionDelay: `${delay}ms` }}
      >
        {Array.from({ length: 10 }, (_, n) => (
          <span key={n} className="flex h-7 items-center justify-center">
            {n}
          </span>
        ))}
      </span>
      {/* split-flap seam and sheen */}
      <span className="pointer-events-none absolute inset-x-0 top-1/2 h-px bg-black/35" />
      <span className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/10 to-transparent" />
    </span>
  );
}
