import Link from "next/link";
import { requireMember } from "@/lib/session";
import { nameForUser } from "@/lib/people";
import { fmtDate, fmtDateTime } from "@/lib/dates";
import type { Suggestion } from "@/lib/types";
import { acceptSuggestion, dismissSuggestion, reopenSuggestion } from "@/app/actions";
import { Badge, Card, Empty, MemberSelect, SourceBadge, btnCls, btnGhost, inputCls } from "@/components/ui";
import { CopyButton } from "@/components/copy-button";

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
          Drafted from email, calendar, Granola and Plaud. Nothing is created or sent until someone accepts it, and follow-up drafts are only ever copied, never sent from here.
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
                  <input name="title" defaultValue={s.title} className={`${inputCls} w-full font-medium`} />
                  {s.details && <p className="whitespace-pre-wrap text-sm text-[var(--muted)]">{s.details}</p>}
                  {s.contact_name && <p className="text-sm">Contact: {s.contact_name}{s.contact_email && <> · <span className="text-[var(--muted)]">{s.contact_email}</span></>}</p>}
                  {s.draft && (
                    <details className="rounded-xl bg-[var(--bg)] p-3 text-sm">
                      <summary className="cursor-pointer font-medium">Draft message</summary>
                      <p className="mt-2 whitespace-pre-wrap">{s.draft}</p>
                    </details>
                  )}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <MemberSelect members={members} defaultValue={s.suggested_assignee} />
                    <input type="date" name="due_date" defaultValue={s.suggested_due ?? ""} className={inputCls} />
                    <button className={btnCls}>Accept{s.kind === "task" ? " as task" : " as follow-up"}</button>
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
