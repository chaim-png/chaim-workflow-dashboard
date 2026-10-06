"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type DueSoonItem = { key: string; title: string; href: string; due_date: string; due_time: string | null; urgency: string };

const WINDOW_MS = 2 * 60 * 60 * 1000;
const LUNCH = "13:00"; // items due today with no time count as due by lunchtime

function dueAt(i: DueSoonItem) {
  return new Date(`${i.due_date}T${(i.due_time ?? LUNCH).slice(0, 5)}:00+02:00`).getTime();
}

type Pos = { x: number; y: number } | null;

function readPos(): Pos {
  try {
    return JSON.parse(localStorage.getItem("due-soon-pos") ?? "null");
  } catch {
    return null;
  }
}

function readDismissed(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem("due-soon-dismissed") ?? "{}");
  } catch {
    return {};
  }
}

/** Pop-up for the signed-in person: anything of theirs due in the next two hours, or already past due today. */
export function DueSoon({ items }: { items: DueSoonItem[] }) {
  const router = useRouter();
  const [now, setNow] = useState<number | null>(null);
  const [dismissed, setDismissed] = useState<Record<string, number>>({});
  const [pos, setPos] = useState<Pos>(null);
  const [small, setSmall] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const drag = useRef<{ dx: number; dy: number } | null>(null);

  useEffect(() => {
    setDismissed(readDismissed());
    const saved = readPos();
    // A spot saved on a bigger screen could be off this one; fall back to the corner.
    setPos(saved && saved.x < window.innerWidth - 80 && saved.y < window.innerHeight - 60 ? saved : null);
    try { setSmall(localStorage.getItem("due-soon-small") === "1"); } catch {}
    setNow(Date.now());
    const tick = setInterval(() => setNow(Date.now()), 60_000);
    // Pick up new or changed items every five minutes while the tab is open.
    const refresh = setInterval(() => document.visibilityState === "visible" && router.refresh(), 5 * 60_000);
    return () => { clearInterval(tick); clearInterval(refresh); };
  }, [router]);

  const due = now === null ? [] : items.filter((i) => dueAt(i) - now <= WINDOW_MS && !dismissed[i.key])
    .sort((a, b) => dueAt(a) - dueAt(b));

  useEffect(() => {
    if (!due.length || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const shown = JSON.parse(sessionStorage.getItem("due-soon-notified") ?? "[]") as string[];
    const fresh = due.filter((i) => !shown.includes(i.key));
    if (!fresh.length) return;
    new Notification(fresh.length === 1 ? "Due soon" : `${fresh.length} items due soon`, { body: fresh.map((i) => i.title).join("\n") });
    sessionStorage.setItem("due-soon-notified", JSON.stringify([...shown, ...fresh.map((i) => i.key)]));
  }, [due]);

  if (!due.length || now === null) return null;

  // Drag by the header; the spot is remembered and kept on screen.
  const clamp = (x: number, y: number) => {
    const w = box.current?.offsetWidth ?? 320, h = box.current?.offsetHeight ?? 120;
    return { x: Math.min(Math.max(8, x), window.innerWidth - w - 8), y: Math.min(Math.max(8, y), window.innerHeight - h - 8) };
  };
  const onDown = (e: React.PointerEvent) => {
    if ((e.target as HTMLElement).closest("button")) return;
    const r = box.current!.getBoundingClientRect();
    drag.current = { dx: e.clientX - r.left, dy: e.clientY - r.top };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (drag.current) setPos(clamp(e.clientX - drag.current.dx, e.clientY - drag.current.dy));
  };
  const onUp = () => {
    if (!drag.current) return;
    drag.current = null;
    try { localStorage.setItem("due-soon-pos", JSON.stringify(pos)); } catch {}
  };
  const toggleSmall = () => {
    setSmall(!small);
    try { localStorage.setItem("due-soon-small", small ? "0" : "1"); } catch {}
  };

  const dismiss = (keys: string[]) => {
    const next = { ...readDismissed() };
    for (const k of keys) next[k] = Date.now();
    // Forget dismissals older than two days.
    for (const [k, t] of Object.entries(next)) if (Date.now() - t > 2 * 86_400_000) delete next[k];
    try { localStorage.setItem("due-soon-dismissed", JSON.stringify(next)); } catch {}
    setDismissed(next);
  };

  const when = (i: DueSoonItem) => {
    const mins = Math.round((dueAt(i) - now) / 60_000);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date(now));
    if (i.due_date < today) return "overdue";
    if (!i.due_time) return mins < 0 ? "due today" : "due today, before lunch";
    if (mins < 0) return `was due at ${i.due_time.slice(0, 5)}`;
    return mins < 60 ? `in ${mins} min` : `at ${i.due_time.slice(0, 5)}`;
  };

  return (
    <div ref={box} role="alertdialog" aria-label="Due soon"
      style={pos ? { left: pos.x, top: pos.y } : undefined}
      className={`fixed z-50 w-[min(24rem,calc(100vw-2rem))] rounded-2xl border border-[var(--warn)] bg-[var(--panel)] p-4 shadow-xl ${pos ? "" : "bottom-4 right-4"}`}>
      <div onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} title="Drag to move"
        className={`flex cursor-move touch-none select-none items-center justify-between gap-2 ${small ? "" : "mb-2"}`}>
        <h2 className="text-sm font-semibold text-[var(--warn)]"><span className="mr-1 text-[var(--muted)]">⠿</span>⏰ Due soon ({due.length})</h2>
        <span className="flex gap-3">
          <button onClick={toggleSmall} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">{small ? "Show" : "Hide"}</button>
          <button onClick={() => dismiss(due.map((i) => i.key))} className="text-xs text-[var(--muted)] hover:text-[var(--text)]">Dismiss all</button>
        </span>
      </div>
      {!small && <>
      <ul className="max-h-64 space-y-1.5 overflow-y-auto text-sm">
        {due.map((i) => (
          <li key={i.key} className="flex items-start gap-2">
            <Link href={i.href} className="min-w-0 flex-1 hover:text-[var(--accent)]">
              {i.urgency === "urgent" && <span className="mr-1 text-[var(--bad)]">●</span>}{i.title}
              <span className="block text-xs text-[var(--muted)]">{when(i)}</span>
            </Link>
            <button onClick={() => dismiss([i.key])} aria-label="Dismiss" className="text-[var(--muted)] hover:text-[var(--text)]">×</button>
          </li>
        ))}
      </ul>
      {typeof Notification !== "undefined" && Notification.permission === "default" && (
        <button onClick={() => Notification.requestPermission()} className="mt-2 text-xs text-[var(--accent)] hover:underline">Also show these as desktop alerts</button>
      )}
      </>}
    </div>
  );
}
