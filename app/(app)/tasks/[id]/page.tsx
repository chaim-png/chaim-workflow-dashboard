import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/session";
import { nameForUser } from "@/lib/people";
import { dueLabel, fmtDateTime, hhmm } from "@/lib/dates";
import type { AuditEntry, Client, Task } from "@/lib/types";
import { describeChange, fmtValue } from "@/lib/audit";
import { EmailLinksCard, type EmailLink } from "@/components/email-links";
import { addComment, deleteComment, deleteTask, restoreTask, updateTask } from "@/app/actions";
import { Badge, Card, Empty, MemberSelect, SourceBadge, StatusBadge, UrgencyBadge, UrgencySelect, btnCls, btnGhost, inputCls } from "@/components/ui";

const FIELD_NAME: Record<string, string> = { priority: "urgency", due_date: "due date", due_time: "due time", client_id: "client", waiting_on: "waiting on" };

type Comment = { id: string; body: string; author: string; created_at: string; deleted_at: string | null };

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, me, members } = await requireMember();
  const [{ data: task }, { data: clients }, { data: comments }, { data: history }] = await Promise.all([
    supabase.from("tasks").select("*, clients(id,name)").eq("id", id).maybeSingle(),
    supabase.from("clients").select("id,name").is("deleted_at", null).order("name"),
    supabase.from("task_comments").select("*").eq("task_id", id).order("created_at"),
    supabase.from("audit_log").select("*").eq("row_id", id).order("changed_at", { ascending: false }),
  ]);
  if (!task) notFound();
  const t = task as Task;
  const [{ data: emailLinks }, { data: clientEmailLinks }] = await Promise.all([
    supabase.from("email_links").select("*").eq("task_id", id).order("last_at", { ascending: false }).limit(20),
    t.client_id ? supabase.from("email_links").select("*").eq("client_id", t.client_id).order("last_at", { ascending: false }).limit(5) : Promise.resolve({ data: [] }),
  ]);
  const commentIds = (comments ?? []).map((c) => c.id);
  const { data: commentHistory } = commentIds.length
    ? await supabase.from("audit_log").select("*").in("row_id", commentIds)
    : { data: [] };
  const fullHistory = [...((history ?? []) as AuditEntry[]), ...((commentHistory ?? []) as AuditEntry[])]
    .sort((a, b) => b.changed_at.localeCompare(a.changed_at));
  const creator = nameForUser(members, t.created_by);
  const due = dueLabel(t.due_date, t.due_time, t.status === "done");
  const clientNames = Object.fromEntries(((clients ?? []) as Client[]).map((c) => [c.id, c.name]));

  return (
    <div className="space-y-4">
      <Link href="/tasks" className="text-sm text-[var(--muted)]">← Tasks</Link>
      {t.deleted_at && (
        <form action={restoreTask} className="flex items-center gap-3 rounded-xl bg-[var(--bad-bg)] px-4 py-2 text-sm text-[var(--bad)]">
          <input type="hidden" name="id" value={t.id} />
          This task was deleted. <button className="underline">Restore it</button>
        </form>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card>
            <form action={updateTask} className="space-y-3">
              <input type="hidden" name="id" value={t.id} />
              <input name="title" defaultValue={t.title} required className={`${inputCls} w-full text-base font-semibold`} />
              <div className="flex flex-wrap items-center gap-1.5">
                <StatusBadge status={t.status} />
                <Badge t={due.tone}>{due.text}</Badge>
                <UrgencyBadge u={t.priority} />
                {t.clients && <Link href={`/clients/${t.clients.id}`}><Badge t="accent">{t.clients.name}</Badge></Link>}
                <SourceBadge source={t.source} url={t.source_url} />
              </div>
              <textarea name="details" defaultValue={t.details ?? ""} rows={5} placeholder="Details" className={`${inputCls} w-full`} />
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-xs text-[var(--muted)]">Status
                  <select name="status" defaultValue={t.status} className={`${inputCls} mt-1 w-full`}>
                    <option value="todo">To do</option><option value="in_progress">In progress</option>
                    <option value="waiting">Waiting on someone</option><option value="done">Done</option>
                  </select>
                </label>
                <label className="text-xs text-[var(--muted)]">Assigned to
                  <MemberSelect members={members} defaultValue={t.assignee} className={`${inputCls} mt-1 w-full`} />
                </label>
                <label className="text-xs text-[var(--muted)]">Due date and time
                  <span className="mt-1 flex gap-1.5">
                    <input name="due_date" type="date" defaultValue={t.due_date ?? ""} className={`${inputCls} min-w-0 flex-1`} />
                    <input name="due_time" type="time" defaultValue={hhmm(t.due_time)} className={`${inputCls} w-28`} />
                  </span>
                </label>
                <label className="text-xs text-[var(--muted)]">Urgency
                  <UrgencySelect name="priority" defaultValue={t.priority} className={`${inputCls} mt-1 w-full`} />
                </label>
                <label className="text-xs text-[var(--muted)]">Client / matter
                  <select name="client_id" defaultValue={t.client_id ?? ""} className={`${inputCls} mt-1 w-full`}>
                    <option value="">None</option>
                    {((clients ?? []) as Client[]).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </label>
                <label className="text-xs text-[var(--muted)]">Waiting on
                  <input name="waiting_on" defaultValue={t.waiting_on ?? ""} placeholder="Who?" className={`${inputCls} mt-1 w-full`} />
                </label>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button className={btnCls}>Save changes</button>
                <span className="text-xs text-[var(--muted)]">Created by {creator} · {fmtDateTime(t.created_at)}</span>
              </div>
            </form>
            <div className="mt-3 flex flex-wrap gap-2 border-t border-[var(--line)] pt-3">
              {t.status !== "done" && (
                <form action={updateTask}>
                  <input type="hidden" name="id" value={t.id} /><input type="hidden" name="status" value="done" />
                  <button className={btnGhost}>✓ Mark done</button>
                </form>
              )}
              {t.assignee !== me.email && (
                <form action={updateTask}>
                  <input type="hidden" name="id" value={t.id} /><input type="hidden" name="assignee" value={me.email} />
                  <button className={btnGhost}>Assign to me</button>
                </form>
              )}
              {!t.deleted_at && (
                <form action={deleteTask} className="ml-auto">
                  <input type="hidden" name="id" value={t.id} />
                  <button className="text-sm text-[var(--bad)]">Delete</button>
                </form>
              )}
            </div>
          </Card>

          <Card title={`Comments (${(comments ?? []).filter((c) => !c.deleted_at).length})`}>
            <ul className="space-y-3">
              {((comments ?? []) as Comment[]).filter((c) => !c.deleted_at).map((c) => (
                <li key={c.id} className="rounded-xl bg-[var(--bg)] p-3 text-sm">
                  <div className="mb-1 flex items-center gap-2 text-xs text-[var(--muted)]">
                    <b className="text-[var(--text)]">{nameForUser(members, c.author)}</b> {fmtDateTime(c.created_at)}
                    {c.author === me.user_id && (
                      <form action={deleteComment} className="ml-auto">
                        <input type="hidden" name="id" value={c.id} />
                        <button className="text-[var(--muted)] hover:text-[var(--bad)]">Delete</button>
                      </form>
                    )}
                  </div>
                  <p className="whitespace-pre-wrap">{c.body}</p>
                </li>
              ))}
            </ul>
            <form action={addComment} className="mt-3 space-y-2">
              <input type="hidden" name="task_id" value={t.id} />
              <textarea name="body" required rows={3} placeholder="Add a comment" className={`${inputCls} w-full`} />
              <button className={btnCls}>Post comment</button>
            </form>
          </Card>
        </div>

        <div className="space-y-6">
        <EmailLinksCard links={(emailLinks ?? []) as EmailLink[]} clientLinks={(clientEmailLinks ?? []) as EmailLink[]} members={members} />
        <Card title="History">
          {fullHistory.length === 0 ? <Empty>No changes recorded.</Empty> : (
            <ol className="space-y-3 text-sm">
              {fullHistory.map((h) => (
                <li key={h.id} className="border-l-2 border-[var(--line)] pl-3">
                  <div><b className="font-medium">{h.actor_label}</b> {describeChange(h, members)}</div>
                  {h.action === "update" && h.table_name === "tasks" && (
                    <ul className="mt-1 space-y-0.5 text-xs text-[var(--muted)]">
                      {(h.changed_fields ?? []).filter((f) => f !== "completed_at").map((f) => (
                        <li key={f}>{FIELD_NAME[f] ?? f.replace(/_/g, " ")}: <s>{fmtValue(f, h.old_data?.[f], members, clientNames)}</s> → {fmtValue(f, h.new_data?.[f], members, clientNames)}</li>
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
