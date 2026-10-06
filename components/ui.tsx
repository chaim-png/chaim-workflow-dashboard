import type { Source, TaskStatus, Member, Urgency } from "@/lib/types";
import { fmtDate, todayISO } from "@/lib/dates";
import { firstName } from "@/lib/people";

export const inputCls =
  "rounded-lg border border-[var(--line)] bg-[var(--panel)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--accent)]";
export const btnCls =
  "rounded-lg bg-[var(--accent)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90";
export const btnGhost =
  "rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-1.5 text-sm hover:border-[var(--accent)]";

export function Card({ title, action, children, className = "" }: {
  title?: React.ReactNode; action?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-[var(--line)] bg-[var(--panel)] ${className}`}>
      {(title || action) && (
        <header className="flex items-center justify-between gap-2 border-b border-[var(--line)] px-4 py-3">
          <h2 className="text-sm font-semibold">{title}</h2>
          {action}
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

const tone: Record<string, string> = {
  bad: "bg-[var(--bad-bg)] text-[var(--bad)]",
  warn: "bg-[var(--warn-bg)] text-[var(--warn)]",
  ok: "bg-[var(--ok-bg)] text-[var(--ok)]",
  info: "bg-[var(--info-bg)] text-[var(--info)]",
  muted: "bg-[var(--bg)] text-[var(--muted)]",
  accent: "bg-[var(--accent-bg)] text-[var(--accent)]",
};

export function Badge({ children, t = "muted" }: { children: React.ReactNode; t?: keyof typeof tone | string }) {
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-xs font-medium ${tone[t] ?? tone.muted}`}>{children}</span>;
}

export const STATUS_LABEL: Record<TaskStatus, string> = {
  todo: "To do", in_progress: "In progress", waiting: "Waiting", done: "Done",
};

export const SOURCE_LABEL: Record<Source, string> = {
  manual: "Manual", email: "Email", calendar: "Calendar", granola: "Granola", plaud: "Plaud", whatsapp: "WhatsApp", kb: "Knowledge base",
};

export function SourceBadge({ source, url }: { source: Source; url?: string | null }) {
  const b = <Badge t="info">{SOURCE_LABEL[source] ?? source}</Badge>;
  return url ? <a href={url} target="_blank" rel="noreferrer" title="Open source">{b} ↗</a> : b;
}

export function DueBadge({ due, status }: { due: string | null; status?: TaskStatus }) {
  if (!due) return null;
  const today = todayISO();
  const t = status === "done" ? "muted" : due < today ? "bad" : due === today ? "warn" : "muted";
  const label = status !== "done" && due < today ? `Overdue · ${fmtDate(due)}` : due === today ? "Today" : fmtDate(due);
  return <Badge t={t}>{label}</Badge>;
}

export function StatusBadge({ status }: { status: TaskStatus }) {
  const t = status === "done" ? "ok" : status === "waiting" ? "warn" : status === "in_progress" ? "accent" : "muted";
  return <Badge t={t}>{STATUS_LABEL[status]}</Badge>;
}

export const URGENCY_LABEL: Record<Urgency, string> = { low: "Low", medium: "Medium", urgent: "Urgent" };
export const URGENCY_RANK: Record<Urgency, number> = { urgent: 0, medium: 1, low: 2 };

export function UrgencyBadge({ u, quiet }: { u: Urgency; quiet?: boolean }) {
  if (quiet && u === "medium") return null;
  const t = u === "urgent" ? "bad" : u === "low" ? "muted" : "info";
  return <Badge t={t}>{u === "urgent" ? "● " : ""}{URGENCY_LABEL[u]}</Badge>;
}

export function UrgencySelect({ name = "urgency", defaultValue = "medium", className = inputCls }: { name?: string; defaultValue?: Urgency; className?: string }) {
  return (
    <select name={name} defaultValue={defaultValue} className={className} aria-label="Urgency">
      <option value="low">Low</option><option value="medium">Medium</option><option value="urgent">Urgent</option>
    </select>
  );
}

const AVATAR = ["#2f5d50", "#2b5a8a", "#8a5a00", "#7a3b69", "#a3302a"];

/** The person's chosen colour, or a steady fallback from their email. */
export function memberColor(members: Member[], email: string | null | undefined): string {
  if (!email) return "var(--muted)";
  return members.find((m) => m.email === email)?.color ?? AVATAR[[...email].reduce((a, c) => a + c.charCodeAt(0), 0) % AVATAR.length];
}

/** Initials chip plus first name, so the "who" column reads at a glance. */
export function Person({ members, email }: { members: Member[]; email: string | null | undefined }) {
  if (!email) return <span className="text-xs text-[var(--muted)]">Unassigned</span>;
  const name = firstName(members, email);
  const full = members.find((m) => m.email === email)?.full_name ?? email;
  const initials = full.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  const color = memberColor(members, email);
  return (
    <span className="inline-flex items-center gap-1.5 text-sm" title={full}>
      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full text-[10px] font-semibold text-white" style={{ background: color }}>{initials}</span>
      {name}
    </span>
  );
}

export function MemberSelect({ members, name = "assignee", defaultValue, className = inputCls, allowNone = true }: {
  members: Member[]; name?: string; defaultValue?: string | null; className?: string; allowNone?: boolean;
}) {
  return (
    <select name={name} defaultValue={defaultValue ?? ""} className={className}>
      {allowNone && <option value="">Unassigned</option>}
      {members.map((m) => <option key={m.email} value={m.email}>{m.full_name}</option>)}
    </select>
  );
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-2 text-sm text-[var(--muted)]">{children}</p>;
}
