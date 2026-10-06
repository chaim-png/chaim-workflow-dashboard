"use client";

import { useEffect } from "react";

/** A short burst of confetti, once per day per browser, when today's list is cleared. */
export function Confetti({ fire, day }: { fire: boolean; day: string }) {
  useEffect(() => {
    if (!fire || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    try {
      if (localStorage.getItem("confetti-day") === day) return;
      localStorage.setItem("confetti-day", day);
    } catch {}
    const canvas = document.createElement("canvas");
    canvas.style.cssText = "position:fixed;inset:0;width:100vw;height:100vh;pointer-events:none;z-index:60";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    document.body.appendChild(canvas);
    const ctx = canvas.getContext("2d")!;
    const colours = ["#2f6f5e", "#2b6cb0", "#b83280", "#d69e2e", "#e53e3e", "#38a169"];
    const bits = Array.from({ length: 160 }, () => ({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height / 3,
      vx: (Math.random() - 0.5) * 14,
      vy: -Math.random() * 12 - 4,
      r: Math.random() * Math.PI,
      c: colours[Math.floor(Math.random() * colours.length)],
    }));
    let frame = 0;
    let raf = 0;
    const step = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const b of bits) {
        b.vy += 0.35;
        b.x += b.vx;
        b.y += b.vy;
        b.r += 0.2;
        ctx.save();
        ctx.translate(b.x, b.y);
        ctx.rotate(b.r);
        ctx.fillStyle = b.c;
        ctx.fillRect(-4, -2, 8, 4);
        ctx.restore();
      }
      if (++frame < 150) raf = requestAnimationFrame(step);
      else canvas.remove();
    };
    raf = requestAnimationFrame(step);
    return () => { cancelAnimationFrame(raf); canvas.remove(); };
  }, [fire, day]);
  return null;
}
