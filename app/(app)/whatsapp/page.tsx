import Link from "next/link";
import { requireMember } from "@/lib/session";
import { fmtDateTime } from "@/lib/dates";
import type { Client, WhatsAppContact, WhatsAppMessage } from "@/lib/types";
import { sortWhatsAppContact } from "@/app/actions";
import { Badge, Card, Empty, btnCls, btnGhost, inputCls } from "@/components/ui";

type Show = "clients" | "sort" | "personal";
type NumberRow = { display_phone: string; owner: string; label: string; connected_at: string | null };

const fmtPhone = (n: string) => (n.startsWith("27") ? `0${n.slice(2, 4)} ${n.slice(4, 7)} ${n.slice(7)}` : `+${n}`);

export default async function WhatsAppPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { supabase, me } = await requireMember();
  const p = (await searchParams).show;
  const show: Show = p === "sort" || p === "personal" ? p : "clients";

  // RLS: client chats are visible to the team; unsorted and personal contacts only to the number's owner.
  const [{ data: numbers }, { data: contacts, error }, { data: clients }, { data: settings }] = await Promise.all([
    supabase.from("whatsapp_numbers").select("display_phone, owner, label, connected_at").order("label"),
    supabase.from("whatsapp_contacts").select("*, clients(id,name)").order("last_message_at", { ascending: false, nullsFirst: false }).limit(1000),
    supabase.from("clients").select("id,name").is("deleted_at", null).order("name"),
    supabase.from("whatsapp_settings").select("unsorted_hold_hours").maybeSingle(),
  ]);
  if (error) throw new Error(error.message);
  const nums = (numbers ?? []) as NumberRow[];
  const all = (contacts ?? []) as WhatsAppContact[];
  const mine = new Set(nums.filter((n) => n.owner === me.email).map((n) => n.display_phone));
  const labelFor = (phone: string) => nums.find((n) => n.display_phone === phone)?.label ?? phone;
  const groups: Record<Show, WhatsAppContact[]> = {
    clients: all.filter((c) => c.status === "client"),
    sort: all.filter((c) => c.status === "unsorted" && mine.has(c.display_phone)),
    personal: all.filter((c) => c.status === "personal" && mine.has(c.display_phone)),
  };
  const list = groups[show].slice(0, 200);

  const { data: msgs } = list.length && show !== "personal"
    ? await supabase.from("whatsapp_messages").select("id, contact_id, direction, sent_at, type, body")
        .in("contact_id", list.map((c) => c.id)).order("sent_at", { ascending: false }).limit(1500)
    : { data: [] };
  const recent = new Map<string, WhatsAppMessage[]>();
  for (const m of (msgs ?? []) as WhatsAppMessage[]) {
    const arr = recent.get(m.contact_id) ?? [];
    if (arr.length < 8 && m.body) arr.push(m);
    recent.set(m.contact_id, arr);
  }
  const hold = settings?.unsorted_hold_hours ?? 0;
  const tabs: [Show, string][] = [["clients", "Client chats"], ["sort", "To sort"], ["personal", "Personal"]];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">WhatsApp</h1>
        <div className="flex gap-1 text-sm">
          {tabs.map(([v, label]) => (
            <Link key={v} href={`/whatsapp?show=${v}`} className={`rounded-lg px-2.5 py-1.5 ${show === v ? "bg-[var(--accent-bg)] text-[var(--accent)] font-medium" : "text-[var(--muted)]"}`}>
              {label} ({groups[v].length})
            </Link>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-2 text-sm">
        {nums.map((n) => (
          <Badge key={n.display_phone} t={n.connected_at ? "ok" : "warn"}>
            {n.label}: {fmtPhone(n.display_phone)} · {n.connected_at ? `connected ${fmtDateTime(n.connected_at)}` : "not connected yet"}
          </Badge>
        ))}
      </div>

      {show === "sort" && (
        <p className="text-sm text-[var(--muted)]">
          Only you see this list. Mark each contact as a client or personal.{" "}
          {hold > 0
            ? `Messages from contacts you haven't sorted are kept for ${hold} hours, then deleted.`
            : "No message text is kept for contacts you haven't sorted."}
        </p>
      )}

      {show === "personal" ? (
        <Card title="Personal contacts">
          <p className="text-sm text-[var(--muted)]">Nothing from these chats is stored. Only you see this list.</p>
          {list.length > 0 && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-[var(--accent)]">Show names</summary>
              <ul className="mt-2 divide-y divide-[var(--line)]">
                {list.map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-2 py-2">
                    <span>{c.name ?? fmtPhone(c.wa_id)}</span>
                    <SortButton id={c.id} status="unsorted" label="Move to To sort" />
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>
      ) : (
        <Card>
          {list.length === 0 ? (
            <Empty>{show === "clients" ? "No client chats yet. Mark contacts as clients under To sort." : "Nothing to sort."}</Empty>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {list.map((c) => {
                const own = mine.has(c.display_phone);
                const thread = (recent.get(c.id) ?? []).slice().reverse();
                return (
                  <li key={c.id} className="py-3">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-sm font-medium">{c.name ?? fmtPhone(c.wa_id)}</span>
                      {c.name && <span className="text-sm text-[var(--muted)]">· {fmtPhone(c.wa_id)}</span>}
                      <Badge>{labelFor(c.display_phone)}&apos;s phone</Badge>
                      {c.clients && <Link href={`/clients/${c.clients.id}`}><Badge t="accent">{c.clients.name}</Badge></Link>}
                      <span className="text-xs text-[var(--muted)]">{c.message_count} messages{c.last_message_at ? ` · last ${fmtDateTime(c.last_message_at)}` : ""}</span>
                    </div>
                    {thread.length > 0 && (
                      <details className="mt-2 rounded-xl bg-[var(--bg)] p-3 text-sm">
                        <summary className="cursor-pointer font-medium">Recent messages</summary>
                        <ul className="mt-2 space-y-1.5">
                          {thread.map((m) => (
                            <li key={m.id} className={m.direction === "out" ? "text-right" : ""}>
                              <span className="text-xs text-[var(--muted)]">{m.direction === "out" ? labelFor(c.display_phone) : c.name ?? "Them"} · {fmtDateTime(m.sent_at)}</span>
                              <p className="whitespace-pre-wrap">{m.body}</p>
                            </li>
                          ))}
                        </ul>
                      </details>
                    )}
                    {own && (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <form action={sortWhatsAppContact} className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="id" value={c.id} />
                          <input type="hidden" name="status" value="client" />
                          <input type="hidden" name="redirect_to" value={`/whatsapp?show=${show}`} />
                          <select name="client_id" defaultValue={c.client_id ?? ""} className={inputCls}>
                            <option value="">No client / matter linked</option>
                            {((clients ?? []) as Client[]).map((cl) => <option key={cl.id} value={cl.id}>{cl.name}</option>)}
                          </select>
                          <button className={show === "sort" ? btnCls : btnGhost}>{show === "sort" ? "Client" : "Save"}</button>
                        </form>
                        <SortButton id={c.id} status="personal" label="Personal" redirectTo={`/whatsapp?show=${show}`} />
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      )}
    </div>
  );
}

function SortButton({ id, status, label, redirectTo = "/whatsapp?show=personal" }: { id: string; status: string; label: string; redirectTo?: string }) {
  return (
    <form action={sortWhatsAppContact}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <input type="hidden" name="redirect_to" value={redirectTo} />
      <button className={btnGhost}>{label}</button>
    </form>
  );
}
