import Link from "next/link";
import { requireMember } from "@/lib/session";
import { fmtDateTime } from "@/lib/dates";
import type { AuditEntry } from "@/lib/types";
import { describeChange } from "@/lib/audit";
import { Card, Empty, inputCls, btnGhost } from "@/components/ui";

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ who?: string; table?: string; page?: string }> }) {
  const { supabase, members } = await requireMember();
  const sp = await searchParams;
  const page = Math.max(0, Number(sp.page ?? 0));
  const size = 100;
  let q = supabase.from("audit_log").select("*").order("changed_at", { ascending: false }).range(page * size, page * size + size - 1);
  if (sp.who) q = q.eq("actor_label", sp.who);
  if (sp.table) q = q.eq("table_name", sp.table);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as AuditEntry[];
  const linkFor = (a: AuditEntry) =>
    a.table_name === "tasks" ? `/tasks/${a.row_id}`
    : a.table_name === "task_comments" && a.new_data?.task_id ? `/tasks/${a.new_data.task_id}`
    : a.table_name === "clients" ? `/clients/${a.row_id}` : null;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">History</h1>
        <p className="text-sm text-[var(--muted)]">Every change anyone makes is recorded here with who made it and when. Nothing is permanently deleted.</p>
      </div>
      <form action="/history" className="flex flex-wrap gap-2">
        <select name="who" defaultValue={sp.who ?? ""} className={inputCls}>
          <option value="">Everyone</option>
          {members.map((m) => <option key={m.email} value={m.full_name}>{m.full_name}</option>)}
          <option value="Claude (sync)">Claude (sync)</option>
        </select>
        <select name="table" defaultValue={sp.table ?? ""} className={inputCls}>
          <option value="">Everything</option>
          <option value="tasks">Tasks</option><option value="task_comments">Comments</option>
          <option value="follow_ups">Follow-ups</option><option value="suggestions">Suggestions</option><option value="clients">Clients</option>
        </select>
        <button className={btnGhost}>Filter</button>
      </form>
      <Card>
        {rows.length === 0 ? <Empty>No changes.</Empty> : (
          <ul className="divide-y divide-[var(--line)] text-sm">
            {rows.map((a) => {
              const href = linkFor(a);
              return (
                <li key={a.id} className="flex flex-wrap gap-x-3 py-2">
                  <span className="w-28 shrink-0 text-xs tabular-nums text-[var(--muted)]">{fmtDateTime(a.changed_at)}</span>
                  <span className="flex-1"><b className="font-medium">{a.actor_label}</b> {href ? <Link href={href} className="hover:text-[var(--accent)]">{describeChange(a, members)}</Link> : describeChange(a, members)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
      <div className="flex gap-2 text-sm">
        {page > 0 && <Link className={btnGhost} href={`/history?${new URLSearchParams({ ...(sp.who ? { who: sp.who } : {}), ...(sp.table ? { table: sp.table } : {}), page: String(page - 1) })}`}>Newer</Link>}
        {rows.length === size && <Link className={btnGhost} href={`/history?${new URLSearchParams({ ...(sp.who ? { who: sp.who } : {}), ...(sp.table ? { table: sp.table } : {}), page: String(page + 1) })}`}>Older</Link>}
      </div>
    </div>
  );
}
