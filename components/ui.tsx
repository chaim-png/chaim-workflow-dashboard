import Link from "next/link";
import type { Source, Task, TaskStatus, Member } from "@/lib/types";
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

export function TaskRow({ task, members }: { task: Task; members: Member[] }) {
  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-[var(--line)] py-2.5 last:border-0">
      <Link href={`/tasks/${task.id}`} className={`min-w-0 flex-1 text-sm hover:text-[var(--accent)] ${task.status === "done" ? "line-through text-[var(--muted)]" : ""}`}>
        {task.priority === "high" && <span className="mr-1 text-[var(--bad)]" title="High priority">●</span>}
        {task.title}
      </Link>
      <div className="flex flex-wrap items-center gap-1.5">
        {task.clients && <Badge t="accent">{task.clients.name}</Badge>}
        <DueBadge due={task.due_date} status={task.status} />
        {task.status !== "todo" && <StatusBadge status={task.status} />}
        <Badge>{firstName(members, task.assignee)}</Badge>
      </div>
    </li>
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
