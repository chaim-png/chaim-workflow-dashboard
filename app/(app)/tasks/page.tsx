import Link from "next/link";
import { requireMember } from "@/lib/session";
import { dayBoundsUTC, endOfWeekISO, todayISO } from "@/lib/dates";
import type { CalendarEvent, Client, Task } from "@/lib/types";
import { Card, inputCls, btnGhost } from "@/components/ui";
import { SORTS, TodoTable, eventItem, sortItems, taskItem, withEmails, type SortKey } from "@/components/todo";
import { NewTaskForm } from "@/components/task-form";

const VIEWS = [
  { v: "open", l: "All open" },
  { v: "overdue", l: "Overdue" },
  { v: "today", l: "Today" },
  { v: "week", l: "This week" },
  { v: "waiting", l: "Waiting" },
  { v: "done", l: "Done" },
  { v: "deleted", l: "Deleted" },
];

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { supabase, me, members } = await requireMember();
  const sp = await searchParams;
  const view = sp.view ?? "open";
  const who = sp.who ?? "";
  const clientId = sp.client ?? "";
  const q = sp.q ?? "";
  const urg = sp.u ?? "";
  const sort = (SORTS.some((x) => x.v === sp.sort) ? sp.sort : view === "done" ? "newest" : "due") as SortKey;
  const today = todayISO();
  const owner = members.find((m) => m.role === "owner")?.email ?? null;

  let query = supabase.from("tasks").select("*, clients(id,name)");
  query = view === "deleted" ? query.not("deleted_at", "is", null) : query.is("deleted_at", null);
  if (view === "done") query = query.eq("status", "done");
  else if (view !== "deleted") query = query.neq("status", "done");
  if (view === "overdue") query = query.lt("due_date", today);
  if (view === "today") query = query.eq("due_date", today);
  if (view === "week") query = query.gte("due_date", today).lte("due_date", endOfWeekISO());
  if (view === "waiting") query = query.eq("status", "waiting");
  if (who === "none") query = query.is("assignee", null);
  else if (who) query = query.eq("assignee", who);
  if (clientId) query = query.eq("client_id", clientId);
  if (urg) query = query.eq("priority", urg);
  if (q) query = query.or(`title.ilike.%${q.replace(/[%,()]/g, " ")}%,details.ilike.%${q.replace(/[%,()]/g, " ")}%`);
  query = view === "done" ? query.order("completed_at", { ascending: false }).limit(200)
    : query.order("due_date", { ascending: true, nullsFirst: false }).order("created_at");

  const [dayStart, dayEnd] = dayBoundsUTC(today);
  const showCalendar = (view === "today" || view === "open") && !q && !clientId && !urg && (!who || who === owner);
  const [{ data: tasks, error }, { data: clients }, { data: events }, { data: tracked }] = await Promise.all([
    query,
    supabase.from("clients").select("id,name,kind,notes").is("deleted_at", null).order("name"),
    showCalendar
      ? supabase.from("calendar_events").select("*").gte("starts_at", dayStart).lte("starts_at", dayEnd).eq("declined", false).order("starts_at")
      : Promise.resolve({ data: [] }),
    supabase.from("tasks").select("source_ref").eq("source", "calendar").is("deleted_at", null).gte("due_date", today),
  ]);
  if (error) throw new Error(error.message);
  const trackedIds = new Set((tracked ?? []).map((t: { source_ref: string }) => t.source_ref));
  const items = sortItems(await withEmails(supabase, [
    ...((tasks ?? []) as Task[]).map(taskItem),
    ...((events ?? []) as CalendarEvent[]).filter((e) => !trackedIds.has(e.id)).map((e) => eventItem(e, owner)),
  ], members), sort);

  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ view, who, client: clientId, q, u: urg, sort: sp.sort ?? "", ...patch });
    for (const [k, v] of [...p.entries()]) if (!v) p.delete(k);
    return `/tasks?${p}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Tasks</h1>
      </div>

      <details open={sp.new === "1"} className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--accent)]">+ New task</summary>
        <div className="mt-3"><NewTaskForm members={members} clients={(clients ?? []) as Client[]} me={me.email} /></div>
      </details>

      <div className="flex flex-wrap gap-1 text-sm">
        {VIEWS.map((x) => (
          <Link key={x.v} href={link({ view: x.v })}
            className={`rounded-lg px-2.5 py-1.5 ${view === x.v ? "bg-[var(--accent-bg)] text-[var(--accent)] font-medium" : "text-[var(--muted)]"}`}>{x.l}</Link>
        ))}
      </div>

      <form className="flex flex-wrap gap-2" action="/tasks">
        <input type="hidden" name="view" value={view} />
        <input name="q" defaultValue={q} placeholder="Search tasks" className={inputCls} />
        <select name="who" defaultValue={who} className={inputCls}>
          <option value="">Anyone</option>
          {members.map((m) => <option key={m.email} value={m.email}>{m.full_name}</option>)}
          <option value="none">Unassigned</option>
        </select>
        <select name="client" defaultValue={clientId} className={inputCls}>
          <option value="">All clients</option>
          {(clients ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select name="u" defaultValue={urg} className={inputCls}>
          <option value="">Any urgency</option>
          <option value="urgent">Urgent</option><option value="medium">Medium</option><option value="low">Low</option>
        </select>
        <select name="sort" defaultValue={sp.sort ?? ""} className={inputCls}>
          {SORTS.map((x) => <option key={x.v} value={x.v === "due" ? "" : x.v}>Sort: {x.l}</option>)}
        </select>
        <button className={btnGhost}>Apply</button>
        {(q || who || clientId || urg || sp.sort) && <Link href={`/tasks?view=${view}`} className="self-center text-sm text-[var(--muted)]">Clear</Link>}
      </form>

      <Card>
        <TodoTable items={items} members={members} me={me.email} empty="No tasks here." />
        <p className="mt-3 text-xs text-[var(--muted)]">{items.length} item{items.length === 1 ? "" : "s"}{showCalendar && (events ?? []).length > 0 ? " · today's calendar items are included; tick one to mark it done, or track it as a task" : ""}</p>
      </Card>
    </div>
  );
}
