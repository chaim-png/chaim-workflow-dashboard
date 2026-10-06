import Link from "next/link";
import { requireMember } from "@/lib/session";
import { nameForUser } from "@/lib/people";
import { fmtDate, fmtDateTime, hhmm } from "@/lib/dates";
import type { Suggestion } from "@/lib/types";
import { acceptSuggestion, dismissSuggestion, reopenSuggestion, updateSuggestion } from "@/app/actions";
import { Badge, Card, Empty, MemberSelect, SourceBadge, UrgencyBadge, UrgencySelect, btnCls, btnGhost, inputCls } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";

const lbl = "text-xs text-[var(--muted)]";

export default async function SuggestionsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { supabase, members } = await requireMember();
  const tab = (await searchParams).tab ?? "task";
  const isHistory = tab === "decided";
  let q = supabase.from("suggestions").select("*");
  q = isHistory ? q.neq("status", "pending").order("decided_at", { ascending: false }).limit(100)
    : q.eq("status", "pending").eq("kind", tab === "follow_up" ? "follow_up" : "task").order("source_date", { ascending: false });
  const [{ data, error }, { data: counts }] = await Promise.all([
    q,
    supabase.from("suggestions").select("kind").eq("status", "pending"),
  ]);
  if (error) throw new Error(error.message);
  const nTask = (counts ?? []).filter((c) => c.kind === "task").length;
  const nFu = (counts ?? []).filter((c) => c.kind === "follow_up").length;
  const items = (data ?? []) as Suggestion[];

  const tabs = [
    { v: "task", l: `Suggested tasks (${nTask})` },
    { v: "follow_up", l: `Follow-up suggestions (${nFu})` },
    { v: "decided", l: "Accepted and dismissed" },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold">Suggestions</h1>
        <p className="text-sm text-[var(--muted)]">
          Drafted from email, calendar, Granola and Plaud. Edit anything in a box, then accept it. Nothing is created or sent until someone accepts, and drafts are never sent from here.
        </p>
      </div>
      <div className="flex flex-wrap gap-1 text-sm">
        {tabs.map((x) => (
          <Link key={x.v} href={`/suggestions?tab=${x.v}`}
            className={`rounded-lg px-2.5 py-1.5 ${tab === x.v ? "bg-[var(--accent-bg)] text-[var(--accent)] font-medium" : "text-[var(--muted)]"}`}>{x.l}</Link>
        ))}
      </div>

      {items.length === 0 && <Card><Empty>{isHistory ? "Nothing decided yet." : "No suggestions waiting. New ones arrive with each sync."}</Empty></Card>}

      <div className="space-y-3">
        {items.map((s) => (
          <Card key={s.id}>
            <div className="mb-2 flex flex-wrap items-center gap-1.5">
              <Badge t={s.kind === "task" ? "accent" : "warn"}>{s.kind === "task" ? "Task" : "Follow-up"}</Badge>
              <SourceBadge source={s.source} url={s.source_url} />
              {s.client_name && <Badge t="accent">{s.client_name}</Badge>}
              <UrgencyBadge u={s.urgency} quiet />
              {s.source_date && <span className="text-xs text-[var(--muted)]">from {fmtDate(s.source_date)}</span>}
              {isHistory && <Badge t={s.status === "accepted" ? "ok" : "muted"}>{s.status === "accepted" ? "Accepted" : "Dismissed"} by {nameForUser(members, s.decided_by)} · {fmtDateTime(s.decided_at)}</Badge>}
            </div>
            {isHistory ? (
              <div className="flex flex-wrap items-center gap-2">
                <p className="flex-1 text-sm font-medium">{s.title}</p>
                {s.status === "accepted" && s.result_id && s.kind === "task" && <Link className="text-sm text-[var(--accent)]" href={`/tasks/${s.result_id}`}>Open task</Link>}
                {s.status === "dismissed" && (
                  <form action={reopenSuggestion}><input type="hidden" name="id" value={s.id} /><button className={btnGhost}>Bring back</button></form>
                )}
              </div>
            ) : (
              <>
                <form action={acceptSuggestion} className="space-y-2">
                  <input type="hidden" name="id" value={s.id} />
                  <input name="title" defaultValue={s.title} aria-label="Title" className={`${inputCls} w-full font-medium`} />
                  <textarea name="details" defaultValue={s.details ?? ""} rows={2} placeholder="Details" aria-label="Details" className={`${inputCls} w-full text-[var(--muted)]`} />
                  {(s.kind === "follow_up" || s.contact_name || s.contact_email) && (
                    <div className="grid gap-2 sm:grid-cols-2">
                      <input name="contact_name" defaultValue={s.contact_name ?? ""} placeholder="Contact name" aria-label="Contact name" className={inputCls} />
                      <input name="contact_email" type="email" defaultValue={s.contact_email ?? ""} placeholder="Contact email" aria-label="Contact email" className={inputCls} />
                    </div>
                  )}
                  <details className="rounded-xl bg-[var(--bg)] p-3 text-sm" open={Boolean(s.draft) && s.kind === "follow_up"}>
                    <summary className="cursor-pointer font-medium">{s.draft ? "Draft message (edit before accepting)" : "Add a draft message"}</summary>
                    <textarea name="draft" defaultValue={s.draft ?? ""} rows={7} className={`${inputCls} mt-2 w-full font-mono text-xs`} />
                  </details>
                  <div className="grid gap-2 pt-1 sm:grid-cols-[auto_auto_auto_auto_auto_1fr] sm:items-end">
                    <label className={lbl}>Action
                      <select name="kind" defaultValue={s.kind} className={`${inputCls} mt-1 block w-full`}>
                        <option value="task">Task</option><option value="follow_up">Follow-up</option>
                      </select>
                    </label>
                    <label className={lbl}>Assign to<MemberSelect members={members} defaultValue={s.suggested_assignee} className={`${inputCls} mt-1 block w-full`} /></label>
                    <label className={lbl}>Due date<input type="date" name="due_date" defaultValue={s.suggested_due ?? ""} className={`${inputCls} mt-1 block w-full`} /></label>
                    <label className={lbl}>Time of day<input type="time" name="due_time" defaultValue={hhmm(s.suggested_time)} className={`${inputCls} mt-1 block w-full`} /></label>
                    <label className={lbl}>Urgency<UrgencySelect defaultValue={s.urgency} className={`${inputCls} mt-1 block w-full`} /></label>
                    <label className={lbl}>Client / matter<input name="client_name" defaultValue={s.client_name ?? ""} placeholder="None" className={`${inputCls} mt-1 block w-full`} /></label>
                  </div>
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <button className={btnCls}>Accept</button>
                    <button formAction={updateSuggestion} className={btnGhost}>Save edits</button>
                    {s.draft && <CopyButton text={s.draft} />}
                  </div>
                </form>
                <form action={dismissSuggestion} className="mt-2">
                  <input type="hidden" name="id" value={s.id} />
                  <button className="text-sm text-[var(--muted)] hover:text-[var(--bad)]">Dismiss</button>
                </form>
              </>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
