import Link from "next/link";
import { requireMember } from "@/lib/session";
import { daysSince, dueLabel, hhmm } from "@/lib/dates";
import { followUpCompose } from "@/lib/mail";
import type { Client, FollowUp } from "@/lib/types";
import { createFollowUp, followUpToTask, updateFollowUp } from "@/app/actions";
import { Badge, Card, Empty, MemberSelect, Person, SourceBadge, UrgencyBadge, UrgencySelect, btnCls, btnGhost, inputCls } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";

export default async function FollowUpsPage({ searchParams }: { searchParams: Promise<{ show?: string }> }) {
  const { supabase, members } = await requireMember();
  const show = (await searchParams).show ?? "open";
  const [{ data, error }, { data: clients }] = await Promise.all([
    supabase.from("follow_ups").select("*, clients(id,name)").is("deleted_at", null).eq("status", show === "done" ? "done" : "open").order("asked_on", { ascending: true, nullsFirst: false }),
    supabase.from("clients").select("id,name").is("deleted_at", null).order("name"),
  ]);
  if (error) throw new Error(error.message);
  const rank = { urgent: 0, medium: 1, low: 2 } as const;
  const all = ((data ?? []) as FollowUp[]).sort((a, b) =>
    rank[a.urgency] - rank[b.urgency] || (a.next_action_on ?? "9999").localeCompare(b.next_action_on ?? "9999"));
  const theyWait = all.filter((f) => f.direction === "they_wait_on_us");
  const weWait = all.filter((f) => f.direction === "we_wait_on_them");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-xl font-semibold">Follow-ups</h1>
        <div className="flex gap-1 text-sm">
          {["open", "done"].map((v) => (
            <Link key={v} href={`/follow-ups?show=${v}`} className={`rounded-lg px-2.5 py-1.5 ${show === v ? "bg-[var(--accent-bg)] text-[var(--accent)] font-medium" : "text-[var(--muted)]"}`}>{v === "open" ? "Open" : "Done"}</Link>
          ))}
        </div>
      </div>

      <details className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-4">
        <summary className="cursor-pointer text-sm font-semibold text-[var(--accent)]">+ New follow-up</summary>
        <form action={createFollowUp} className="mt-3 grid gap-2 sm:grid-cols-6">
          <input name="matter" required placeholder="Matter (e.g. 112 Waterstone Estate)" className={`${inputCls} sm:col-span-3`} />
          <select name="direction" className={`${inputCls} sm:col-span-3`}>
            <option value="they_wait_on_us">They are waiting on us</option>
            <option value="we_wait_on_them">We are waiting on them</option>
          </select>
          <input name="contact_name" placeholder="Contact name" className={`${inputCls} sm:col-span-3`} />
          <input name="contact_email" type="email" placeholder="Contact email" className={`${inputCls} sm:col-span-3`} />
          <input name="what" placeholder="What is outstanding?" className={`${inputCls} sm:col-span-6`} />
          <textarea name="draft" rows={3} placeholder="Draft message (optional)" className={`${inputCls} sm:col-span-6`} />
          <MemberSelect members={members} className={`${inputCls} sm:col-span-2`} />
          <label className="text-xs text-[var(--muted)] sm:col-span-2">Asked on<input name="asked_on" type="date" className={`${inputCls} mt-1 w-full`} /></label>
          <label className="text-xs text-[var(--muted)] sm:col-span-2">Chase on
            <span className="mt-1 flex gap-1.5"><input name="next_action_on" type="date" className={`${inputCls} min-w-0 flex-1`} /><input name="next_action_time" type="time" className={`${inputCls} w-24`} /></span>
          </label>
          <label className="text-xs text-[var(--muted)] sm:col-span-3">Urgency<UrgencySelect className={`${inputCls} mt-1 w-full`} /></label>
          <select name="client_id" defaultValue="" className={`${inputCls} sm:col-span-3`}>
            <option value="">No client / matter</option>
            {((clients ?? []) as Client[]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="sm:col-span-6"><button className={btnCls}>Add follow-up</button></div>
        </form>
      </details>

      <Section title="People waiting on us" items={theyWait} members={members} />
      <Section title="We are waiting on them" items={weWait} members={members} />
    </div>
  );
}

function Section({ title, items, members }: { title: string; items: FollowUp[]; members: Parameters<typeof MemberSelect>[0]["members"] }) {
  return (
    <Card title={`${title} (${items.length})`}>
      {items.length === 0 ? <Empty>None.</Empty> : (
        <ul className="divide-y divide-[var(--line)]">
          {items.map((f) => {
            const age = daysSince(f.asked_on);
            return (
              <li key={f.id} className="py-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Link href={`/follow-ups/${f.id}`} className="font-medium text-sm hover:text-[var(--accent)]">{f.matter}</Link>
                  <UrgencyBadge u={f.urgency} quiet />
                  {f.contact_name && <span className="text-sm text-[var(--muted)]">· {f.contact_name}</span>}
                  {age !== null && <Badge t={f.status === "done" ? "muted" : age > 5 ? "bad" : "warn"}>{age === 0 ? "today" : `${age} days`}</Badge>}
                  {f.next_action_on && <Badge t={dueLabel(f.next_action_on, f.next_action_time).tone}>chase {dueLabel(f.next_action_on, f.next_action_time).text.toLowerCase()}</Badge>}
                  {f.clients && <Badge t="accent">{f.clients.name}</Badge>}
                  <SourceBadge source={f.source} url={f.source_url} />
                  <span className="ml-auto"><Person members={members} email={f.assignee} /></span>
                </div>
                {f.what && <p className="mt-1 text-sm text-[var(--muted)]">{f.what}</p>}
                {f.draft && (
                  <details className="mt-2 rounded-xl bg-[var(--bg)] p-3 text-sm">
                    <summary className="cursor-pointer font-medium">Draft message</summary>
                    <p className="mt-2 whitespace-pre-wrap">{f.draft}</p>
                  </details>
                )}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {f.draft && <CopyButton text={f.draft} />}
                  {(f.contact_email || f.draft) && (
                    <a className={btnGhost} href={followUpCompose(f)} target="_blank" rel="noreferrer">Draft follow-up in Gmail</a>
                  )}
                  <form action={updateFollowUp} className="flex items-center gap-2">
                    <input type="hidden" name="id" value={f.id} />
                    <MemberSelect members={members} defaultValue={f.assignee} />
                    <input type="date" name="next_action_on" defaultValue={f.next_action_on ?? ""} className={inputCls} aria-label="Chase on" />
                    <input type="time" name="next_action_time" defaultValue={hhmm(f.next_action_time)} className={`${inputCls} w-24`} aria-label="Chase time" />
                    <UrgencySelect defaultValue={f.urgency} />
                    <button className={btnGhost}>Save</button>
                  </form>
                  {f.task_id ? <Link href={`/tasks/${f.task_id}`} className="text-sm text-[var(--accent)]">Open task</Link> : (
                    <form action={followUpToTask}><input type="hidden" name="id" value={f.id} /><button className={btnGhost}>Make a task</button></form>
                  )}
                  <form action={updateFollowUp}>
                    <input type="hidden" name="id" value={f.id} />
                    <input type="hidden" name="status" value={f.status === "done" ? "open" : "done"} />
                    <button className={btnGhost}>{f.status === "done" ? "Reopen" : "✓ Done"}</button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
