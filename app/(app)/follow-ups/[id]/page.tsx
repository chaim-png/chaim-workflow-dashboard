import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import { nameForUser } from "@/lib/people";
import { daysSince, dueLabel, fmtDateTime, hhmm } from "@/lib/dates";
import { followUpCompose } from "@/lib/mail";
import type { AuditEntry, Client, FollowUp } from "@/lib/types";
import { describeChange, fmtValue } from "@/lib/audit";
import { followUpToTask, updateFollowUp } from "@/app/actions";
import { Badge, Card, Empty, MemberSelect, SourceBadge, UrgencyBadge, UrgencySelect, btnCls, btnGhost, inputCls } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";
import { EmailLinksCard, type EmailLink } from "@/components/email-links";

const FIELD_NAME: Record<string, string> = {
  next_action_on: "chase date", next_action_time: "chase time", contact_name: "contact", contact_email: "contact email",
  asked_on: "asked on", client_id: "client", what: "what is outstanding",
};

export default async function FollowUpPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me, members } = await requireMember();
  const [{ data: row }, { data: clients }, { data: history }] = await Promise.all([
    supabase.from("follow_ups").select("*, clients(id,name)").eq("id", id).maybeSingle(),
    supabase.from("clients").select("id,name").is("deleted_at", null).order("name"),
    supabase.from("audit_log").select("*").eq("row_id", id).order("changed_at", { ascending: false }),
  ]);
  if (!row) notFound();
  const f = row as FollowUp & { created_by: string | null };
  const [{ data: emailLinks }, { data: clientEmailLinks }] = await Promise.all([
    supabase.from("email_links").select("*").eq("follow_up_id", id).order("last_at", { ascending: false }).limit(20),
    f.client_id ? supabase.from("email_links").select("*").eq("client_id", f.client_id).order("last_at", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
  ]);
  const clientNames = Object.fromEntries(((clients ?? []) as Client[]).map((c) => [c.id, c.name]));
  const due = dueLabel(f.next_action_on, f.next_action_time, f.status === "done");
  const age = daysSince(f.asked_on);
  const lbl = "text-xs text-[var(--muted)]";

  return (
    <div className="space-y-4">
      <Link href="/follow-ups" className="text-sm text-[var(--muted)]">← Follow-ups</Link>
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <form action={updateFollowUp} className="space-y-3">
              <input type="hidden" name="id" value={f.id} />
              <input type="hidden" name="redirect_to" value={`/follow-ups/${f.id}`} />
              <input name="matter" defaultValue={f.matter} required className={`${inputCls} w-full text-base font-semibold`} />
              <div className="flex flex-wrap items-center gap-1.5">
                <Badge t={f.status === "done" ? "ok" : "warn"}>{f.status === "done" ? "Done" : f.direction === "they_wait_on_us" ? "Waiting on us" : "We wait on them"}</Badge>
                {f.next_action_on && <Badge t={due.tone}>chase {due.text.toLowerCase()}</Badge>}
                <UrgencyBadge u={f.urgency} />
                {age !== null && <Badge>{age === 0 ? "asked today" : `asked ${age} days ago`}</Badge>}
                {f.clients && <Link href={`/clients/${f.clients.id}`}><Badge t="accent">{f.clients.name}</Badge></Link>}
                <SourceBadge source={f.source} url={f.source_url} />
              </div>
              <label className={`${lbl} block`}>What is outstanding
                <textarea name="what" defaultValue={f.what ?? ""} rows={3} className={`${inputCls} mt-1 w-full`} />
              </label>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className={lbl}>Contact<input name="contact_name" defaultValue={f.contact_name ?? ""} className={`${inputCls} mt-1 w-full`} /></label>
                <label className={lbl}>Contact email<input name="contact_email" type="email" defaultValue={f.contact_email ?? ""} className={`${inputCls} mt-1 w-full`} /></label>
                <label className={lbl}>Direction
                  <select name="direction" defaultValue={f.direction} className={`${inputCls} mt-1 w-full`}>
                    <option value="they_wait_on_us">They are waiting on us</option>
                    <option value="we_wait_on_them">We are waiting on them</option>
                  </select>
                </label>
                <label className={lbl}>Assigned to<MemberSelect members={members} defaultValue={f.assignee} className={`${inputCls} mt-1 w-full`} /></label>
                <label className={lbl}>Chase on
                  <span className="mt-1 flex gap-1.5">
                    <input name="next_action_on" type="date" defaultValue={f.next_action_on ?? ""} className={`${inputCls} min-w-0 flex-1`} />
                    <input name="next_action_time" type="time" defaultValue={hhmm(f.next_action_time)} className={`${inputCls} w-24`} />
                  </span>
                </label>
                <label className={lbl}>Urgency<UrgencySelect defaultValue={f.urgency} className={`${inputCls} mt-1 w-full`} /></label>
                <label className={lbl}>Asked on<input name="asked_on" type="date" defaultValue={f.asked_on ?? ""} className={`${inputCls} mt-1 w-full`} /></label>
                <label className={lbl}>Client / matter
                  <select name="client_id" defaultValue={f.client_id ?? ""} className={`${inputCls} mt-1 w-full`}>
                    <option value="">None</option>
                    {((clients ?? []) as Client[]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
              </div>
              <label className={`${lbl} block`}>Draft message
                <textarea name="draft" defaultValue={f.draft ?? ""} rows={8} className={`${inputCls} mt-1 w-full font-mono text-xs`} />
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <button className={btnCls}>Save changes</button>
                <span className="text-xs text-[var(--muted)]">Created by {nameForUser(members, f.created_by)} · {fmtDateTime(f.created_at)}</span>
              </div>
            </form>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
              {(f.contact_email || f.draft) && (
                <a className={btnGhost} href={followUpCompose(f, me.email)} target="_blank" rel="noreferrer">Draft follow-up in Gmail</a>
              )}
              {f.draft && <CopyButton text={f.draft} />}
              <form action={updateFollowUp}>
                <input type="hidden" name="id" value={f.id} />
                <input type="hidden" name="status" value={f.status === "done" ? "open" : "done"} />
                <input type="hidden" name="redirect_to" value={`/follow-ups/${f.id}`} />
                <button className={btnGhost}>{f.status === "done" ? "Reopen" : "✓ Mark done"}</button>
              </form>
              {f.assignee !== me.email && (
                <form action={updateFollowUp}>
                  <input type="hidden" name="id" value={f.id} /><input type="hidden" name="assignee" value={me.email} />
                  <input type="hidden" name="redirect_to" value={`/follow-ups/${f.id}`} />
                  <button className={btnGhost}>Assign to me</button>
                </form>
              )}
              {f.task_id ? <Link href={`/tasks/${f.task_id}`} className={btnGhost}>Open linked task</Link> : (
                <form action={followUpToTask}><input type="hidden" name="id" value={f.id} /><button className={btnGhost}>Make a task</button></form>
              )}
            </div>
          </Card>
        </div>

        <div className="space-y-6">
        <EmailLinksCard links={(emailLinks ?? []) as EmailLink[]} clientLinks={(clientEmailLinks ?? []) as EmailLink[]} members={members} />
        <Card title="History">
          {(history ?? []).length === 0 ? <Empty>No changes recorded.</Empty> : (
            <ol className="space-y-3 text-sm">
              {((history ?? []) as AuditEntry[]).map((h) => (
                <li key={h.id} className="border-l-2 border-[var(--line)] pl-3">
                  <div><b className="font-medium">{h.actor_label}</b> {describeChange(h, members)}</div>
                  {h.action === "update" && (
                    <ul className="mt-1 space-y-0.5 text-xs text-[var(--muted)]">
                      {(h.changed_fields ?? []).filter((x) => x !== "task_id" && x !== "draft").map((x) => (
                        <li key={x}>{FIELD_NAME[x] ?? x.replace(/_/g, " ")}: <s>{fmtValue(x, h.old_data?.[x], members, clientNames)}</s> → {fmtValue(x, h.new_data?.[x], members, clientNames)}</li>
                      ))}
                    </ul>
                  )}
                  <div className="text-xs text-[var(--muted)]">{fmtDateTime(h.changed_at)}</div>
                </li>
              ))}
            </ol>
          )}
        </Card>
        </div>
      </div>
    </div>
  );
}
