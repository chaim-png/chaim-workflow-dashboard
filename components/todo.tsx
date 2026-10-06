import Link from "next/link";
import type { CalendarEvent, FollowUp, Member, Task, Urgency } from "@/lib/types";
import { dueLabel, fmtAddress, fmtDate, fmtTime, localDate } from "@/lib/dates";
import { trackCalendarEvent, updateFollowUp, updateTask } from "@/app/actions";
import { Badge, Person, STATUS_LABEL, URGENCY_RANK, UrgencyBadge } from "@/components/ui";

/** One row on any to-do list: a task, a follow-up, or a calendar item not yet tracked. */
export type TodoItem = {
  kind: "task" | "follow_up" | "calendar";
  id: string;
  title: string;
  sub: string | null;
  href: string;
  external?: boolean;
  client: string | null;
  clientHref: string | null;
  place: string | null;
  due_date: string | null;
  due_time: string | null;
  urgency: Urgency;
  assignee: string | null;
  status: string;
  done: boolean;
  created_at: string;
  email?: { who: string; replied: boolean; at: string | null } | null;
};

type LinkRow = { task_id: string | null; follow_up_id: string | null; last_from: string | null; last_from_name: string | null; team_wrote_last: boolean; last_at: string | null };

/** Adds the latest matched email (from either mailbox) to each task and follow-up row. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function withEmails(supabase: any, items: TodoItem[], members: Member[]): Promise<TodoItem[]> {
  const taskIds = items.filter((i) => i.kind === "task").map((i) => i.id);
  const fuIds = items.filter((i) => i.kind === "follow_up").map((i) => i.id);
  if (!taskIds.length && !fuIds.length) return items;
  const ors = [taskIds.length ? `task_id.in.(${taskIds.join(",")})` : null, fuIds.length ? `follow_up_id.in.(${fuIds.join(",")})` : null].filter(Boolean).join(",");
  const { data } = await supabase.from("email_links").select("task_id,follow_up_id,last_from,last_from_name,team_wrote_last,last_at").or(ors);
  const latest = new Map<string, LinkRow>();
  for (const l of (data ?? []) as LinkRow[]) {
    const key = l.task_id ?? l.follow_up_id!;
    if (!latest.has(key) || (l.last_at ?? "") > (latest.get(key)!.last_at ?? "")) latest.set(key, l);
  }
  return items.map((i) => {
    const l = latest.get(i.id);
    if (!l) return i;
    const who = members.find((m) => m.email === l.last_from)?.full_name.split(" ")[0] ?? l.last_from_name?.split(" ")[0] ?? l.last_from ?? "";
    return { ...i, email: { who, replied: l.team_wrote_last, at: l.last_at } };
  });
}

export function taskItem(t: Task): TodoItem {
  return {
    kind: "task", id: t.id, title: t.title, href: `/tasks/${t.id}`,
    sub: t.status === "waiting" && t.waiting_on ? `Waiting on ${t.waiting_on}` : t.status === "in_progress" ? STATUS_LABEL.in_progress : null,
    client: t.clients?.name ?? null, clientHref: t.clients ? `/clients/${t.clients.id}` : null, place: null,
    due_date: t.due_date, due_time: t.due_time, urgency: t.priority, assignee: t.assignee,
    status: t.status, done: t.status === "done", created_at: t.created_at,
  };
}

export function followUpItem(f: FollowUp): TodoItem {
  return {
    kind: "follow_up", id: f.id, title: f.matter, href: `/follow-ups/${f.id}`,
    sub: [f.direction === "they_wait_on_us" ? "Waiting on us" : "We wait on them", f.contact_name].filter(Boolean).join(" · "),
    client: f.clients?.name ?? null, clientHref: f.clients ? `/clients/${f.clients.id}` : null, place: null,
    due_date: f.next_action_on, due_time: f.next_action_time, urgency: f.urgency, assignee: f.assignee,
    status: f.status, done: f.status === "done", created_at: f.created_at,
  };
}

export function eventItem(e: CalendarEvent, owner: string | null): TodoItem {
  return {
    kind: "calendar", id: e.id, title: e.title.trim(), href: e.url ?? "/calendar", external: Boolean(e.url),
    sub: e.attendees ? `With ${e.attendees}` : null, client: null, clientHref: null, place: fmtAddress(e.location) || null,
    due_date: localDate(e.starts_at), due_time: e.all_day ? null : fmtTime(e.starts_at),
    urgency: "medium", assignee: owner, status: "calendar", done: false, created_at: e.starts_at,
  };
}

export type SortKey = "due" | "urgency" | "client" | "assignee" | "newest";
export const SORTS: { v: SortKey; l: string }[] = [
  { v: "due", l: "Due date" }, { v: "urgency", l: "Urgency" }, { v: "client", l: "Client / address" },
  { v: "assignee", l: "Assigned to" }, { v: "newest", l: "Newest" },
];

const dueKey = (i: TodoItem) => `${i.due_date ?? "9999"} ${i.due_time ?? "99"}`;

export function sortItems(items: TodoItem[], sort: SortKey): TodoItem[] {
  const by: Record<SortKey, (a: TodoItem, b: TodoItem) => number> = {
    due: (a, b) => dueKey(a).localeCompare(dueKey(b)) || URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency],
    urgency: (a, b) => URGENCY_RANK[a.urgency] - URGENCY_RANK[b.urgency] || dueKey(a).localeCompare(dueKey(b)),
    client: (a, b) => (a.client ?? a.place ?? "~").localeCompare(b.client ?? b.place ?? "~") || dueKey(a).localeCompare(dueKey(b)),
    assignee: (a, b) => (a.assignee ?? "~").localeCompare(b.assignee ?? "~") || dueKey(a).localeCompare(dueKey(b)),
    newest: (a, b) => b.created_at.localeCompare(a.created_at),
  };
  return [...items].sort(by[sort]);
}

const COLS = "md:grid md:grid-cols-[1.75rem_minmax(0,1fr)_11rem_8.5rem_5.5rem_7.5rem] md:items-center md:gap-3";

export function TodoTable({ items, members, me, empty = "Nothing here.", showHeader = true, back }: {
  items: TodoItem[]; members: Member[]; me?: string; empty?: string; showHeader?: boolean; back?: string;
}) {
  if (items.length === 0) return <p className="py-2 text-sm text-[var(--muted)]">{empty}</p>;
  return (
    <div className="text-sm">
      {showHeader && (
        <div className={`hidden border-b border-[var(--line)] pb-1.5 text-xs font-medium uppercase tracking-wide text-[var(--muted)] ${COLS}`}>
          <span /><span>Item</span><span>Client / address</span><span>Due</span><span>Urgency</span><span>Assigned</span>
        </div>
      )}
      <ul>{items.map((i) => <Row key={`${i.kind}:${i.id}`} item={i} members={members} me={me} back={back} />)}</ul>
    </div>
  );
}

function Row({ item: i, members, me, back }: { item: TodoItem; members: Member[]; me?: string; back?: string }) {
  const due = dueLabel(i.due_date, i.due_time, i.done);
  const title = (
    <span className={`font-medium ${i.done ? "text-[var(--muted)] line-through" : ""}`}>{i.title}</span>
  );
  return (
    <li className={`flex flex-wrap items-start gap-x-3 gap-y-1 border-b border-[var(--line)] py-2.5 last:border-0 ${COLS}`}>
      <DoneBox item={i} me={me} back={back} />
      <div className="min-w-0 flex-1">
        {i.external ? (
          <a href={i.href} target="_blank" rel="noreferrer" className="hover:text-[var(--accent)]">{title}</a>
        ) : (
          <Link href={i.href} className="hover:text-[var(--accent)]">{title}</Link>
        )}
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)]">
          {i.kind === "follow_up" && <Badge t="warn">Follow-up</Badge>}
          {i.kind === "calendar" && <Badge t="info">Calendar</Badge>}
          {i.sub && <span className="truncate">{i.sub}</span>}
          {i.email && (
            <span className={i.email.replied ? "text-[var(--ok)]" : "text-[var(--warn)]"} title="Latest matched email">
              ✉ {i.email.replied ? `${i.email.who} replied` : `${i.email.who} wrote`}{i.email.at ? ` ${fmtDate(i.email.at)}` : ""}
            </span>
          )}
          {i.kind === "calendar" && (
            <form action={trackCalendarEvent}>
              <input type="hidden" name="id" value={i.id} /><input type="hidden" name="mode" value="track" />
              {me && <input type="hidden" name="assignee" value={i.assignee ?? me} />}
              {back && <input type="hidden" name="redirect_to" value={back} />}
              <button className="text-[var(--accent)] hover:underline">Track as task</button>
            </form>
          )}
        </div>
      </div>
      <div className="w-full truncate text-[var(--text)] md:w-auto" title={i.client ?? i.place ?? ""}>
        {i.clientHref ? <Link href={i.clientHref} className="hover:text-[var(--accent)]">{i.client}</Link>
          : i.client ?? (i.place ? <span className="text-[var(--muted)]">{i.place}</span> : <span className="hidden text-[var(--muted)] md:inline">·</span>)}
      </div>
      <div><Badge t={due.tone}>{due.text}</Badge></div>
      <div>{i.kind === "calendar" ? null : <UrgencyBadge u={i.urgency} />}</div>
      <div><Person members={members} email={i.assignee} /></div>
    </li>
  );
}

function DoneBox({ item: i, me, back }: { item: TodoItem; me?: string; back?: string }) {
  const box = (
    <button title={i.done ? "Reopen" : "Mark done"} aria-label={i.done ? "Reopen" : "Mark done"}
      className={`mt-0.5 grid h-5 w-5 place-items-center rounded-md border text-[11px] ${i.done ? "border-[var(--ok)] bg-[var(--ok-bg)] text-[var(--ok)]" : "border-[var(--line)] hover:border-[var(--accent)]"}`}>
      {i.done ? "✓" : ""}
    </button>
  );
  if (i.kind === "calendar") {
    return (
      <form action={trackCalendarEvent}>
        <input type="hidden" name="id" value={i.id} /><input type="hidden" name="mode" value="done" />
        {me && <input type="hidden" name="assignee" value={i.assignee ?? me} />}
        {back && <input type="hidden" name="redirect_to" value={back} />}
        {box}
      </form>
    );
  }
  return (
    <form action={i.kind === "task" ? updateTask : updateFollowUp}>
      <input type="hidden" name="id" value={i.id} />
      <input type="hidden" name="status" value={i.done ? (i.kind === "task" ? "todo" : "open") : "done"} />
      {back && <input type="hidden" name="redirect_to" value={back} />}
      {box}
    </form>
  );
}
