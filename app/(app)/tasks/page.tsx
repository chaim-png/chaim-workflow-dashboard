import Link from "next/link";
import { requireMember } from "@/lib/session";
import { endOfWeekISO, todayISO } from "@/lib/dates";
import type { Client, Task } from "@/lib/types";
import { Card, Empty, TaskRow, inputCls, btnGhost } from "@/components/ui";
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
  const today = todayISO();

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
  if (q) query = query.or(`title.ilike.%${q.replace(/[%,()]/g, " ")}%,details.ilike.%${q.replace(/[%,()]/g, " ")}%`);
  query = view === "done" ? query.order("completed_at", { ascending: false }).limit(200)
    : query.order("due_date", { ascending: true, nullsFirst: false }).order("created_at");

  const [{ data: tasks, error }, { data: clients }] = await Promise.all([
    query,
    supabase.from("clients").select("id,name,kind,notes").is("deleted_at", null).order("name"),
  ]);
  if (error) throw new Error(error.message);

  const link = (patch: Record<string, string>) => {
    const p = new URLSearchParams({ view, who, client: clientId, q, ...patch });
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
        <button className={btnGhost}>Filter</button>
      </form>

      <Card>
        {(tasks ?? []).length === 0 ? <Empty>No tasks here.</Empty> : (
          <ul>{(tasks as Task[]).map((t) => <TaskRow key={t.id} task={t} members={members} />)}</ul>
        )}
      </Card>
    </div>
  );
}
