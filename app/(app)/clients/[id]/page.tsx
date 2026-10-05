import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import { firstName } from "@/lib/people";
import { daysSince } from "@/lib/dates";
import type { Client, FollowUp, Task } from "@/lib/types";
import { updateClientRecord } from "@/app/actions";
import { Badge, Card, Empty, TaskRow, btnGhost, inputCls } from "@/components/ui";
import { NewTaskForm } from "@/components/task-form";

export default async function ClientPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me, members } = await requireMember();
  const [{ data: client }, { data: tasks }, { data: fus }] = await Promise.all([
    supabase.from("clients").select("*").eq("id", id).maybeSingle(),
    supabase.from("tasks").select("*, clients(id,name)").eq("client_id", id).is("deleted_at", null).order("due_date", { nullsFirst: false }),
    supabase.from("follow_ups").select("*").eq("client_id", id).is("deleted_at", null).eq("status", "open"),
  ]);
  if (!client) notFound();
  const c = client as Client;
  const open = ((tasks ?? []) as Task[]).filter((t) => t.status !== "done");
  const closed = ((tasks ?? []) as Task[]).filter((t) => t.status === "done");

  return (
    <div className="space-y-4">
      <Link href="/clients" className="text-sm text-[var(--muted)]">← Clients</Link>
      <h1 className="text-xl font-semibold">{c.name}</h1>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title={`Open tasks (${open.length})`}>
            {open.length === 0 ? <Empty>No open tasks.</Empty> : <ul>{open.map((t) => <TaskRow key={t.id} task={t} members={members} />)}</ul>}
            <details className="mt-3">
              <summary className="cursor-pointer text-sm text-[var(--accent)]">+ Add a task for {c.name}</summary>
              <div className="mt-2"><NewTaskForm members={members} clients={[]} me={me.email} clientId={c.id} redirectTo={`/clients/${c.id}`} /></div>
            </details>
          </Card>
          <Card title={`Open follow-ups (${(fus ?? []).length})`}>
            {(fus ?? []).length === 0 ? <Empty>None.</Empty> : (
              <ul className="divide-y divide-[var(--line)] text-sm">
                {((fus ?? []) as FollowUp[]).map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2 py-2">
                    <span className="flex-1">{f.direction === "they_wait_on_us" ? "Waiting on us" : "We wait on"}: {f.contact_name ?? f.matter}<span className="block text-xs text-[var(--muted)]">{f.what}</span></span>
                    {f.asked_on && <Badge>{daysSince(f.asked_on)} days</Badge>}
                    <Badge>{firstName(members, f.assignee)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          {closed.length > 0 && (
            <Card title={`Done (${closed.length})`}><ul>{closed.map((t) => <TaskRow key={t.id} task={t} members={members} />)}</ul></Card>
          )}
        </div>
        <Card title="Details">
          <form action={updateClientRecord} className="space-y-2">
            <input type="hidden" name="id" value={c.id} />
            <input name="name" defaultValue={c.name} className={`${inputCls} w-full`} />
            <input name="kind" defaultValue={c.kind ?? ""} placeholder="Type" className={`${inputCls} w-full`} />
            <textarea name="notes" defaultValue={c.notes ?? ""} rows={10} placeholder="Notes" className={`${inputCls} w-full`} />
            <button className={btnGhost}>Save</button>
          </form>
        </Card>
      </div>
    </div>
  );
}
