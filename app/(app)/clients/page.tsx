import Link from "next/link";
import { requireMember } from "@/lib/session";
import { createClientRecord } from "@/app/actions";
import { Card, Empty, btnCls, inputCls } from "@/components/ui";

export default async function ClientsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { supabase } = await requireMember();
  const q = (await searchParams).q ?? "";
  let query = supabase.from("clients").select("id,name,kind").is("deleted_at", null).order("name");
  if (q) query = query.ilike("name", `%${q}%`);
  const [{ data: clients }, { data: tasks }, { data: fus }] = await Promise.all([
    query,
    supabase.from("tasks").select("client_id").is("deleted_at", null).neq("status", "done"),
    supabase.from("follow_ups").select("client_id").is("deleted_at", null).eq("status", "open"),
  ]);
  const count = (rows: { client_id: string | null }[] | null, id: string) => (rows ?? []).filter((r) => r.client_id === id).length;

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Clients and matters</h1>
      <div className="flex flex-wrap gap-2">
        <form action="/clients" className="flex gap-2"><input name="q" defaultValue={q} placeholder="Search" className={inputCls} /></form>
        <form action={createClientRecord} className="flex flex-wrap gap-2">
          <input name="name" required placeholder="New client or matter" className={inputCls} />
          <input name="kind" placeholder="Type (e.g. Sale, Lease)" className={inputCls} />
          <button className={btnCls}>Add</button>
        </form>
      </div>
      <Card>
        {(clients ?? []).length === 0 ? <Empty>No clients yet.</Empty> : (
          <ul className="divide-y divide-[var(--line)]">
            {(clients ?? []).map((c) => (
              <li key={c.id} className="flex items-center gap-3 py-2 text-sm">
                <Link href={`/clients/${c.id}`} className="flex-1 hover:text-[var(--accent)]">{c.name}</Link>
                {c.kind && <span className="text-xs text-[var(--muted)]">{c.kind}</span>}
                <span className="w-24 text-right text-xs text-[var(--muted)]">{count(tasks, c.id)} tasks · {count(fus, c.id)} f/u</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
