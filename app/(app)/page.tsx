import Link from "next/link";
import { requireMember } from "@/lib/session";
import { firstName } from "@/lib/people";
import { dayBoundsUTC, daysSince, endOfWeekISO, fmtDate, fmtDateTime, fmtTime, todayISO } from "@/lib/dates";
import type { CalendarEvent, FollowUp, Suggestion, Task, AuditEntry } from "@/lib/types";
import { Badge, Card, Empty, SourceBadge, TaskRow } from "@/components/ui";
import { describeChange } from "@/lib/audit";

export default async function SummaryPage({ searchParams }: { searchParams: Promise<{ who?: string }> }) {
  const { supabase, me, members } = await requireMember();
  const sp = await searchParams;
  const who = sp.who === "all" ? "all" : sp.who && members.some((m) => m.email === sp.who) ? sp.who : me.email;
  const today = todayISO();
  const weekEnd = endOfWeekISO();
  const [dayStart, dayEnd] = dayBoundsUTC(today);

  let taskQ = supabase.from("tasks").select("*, clients(id,name)").is("deleted_at", null).neq("status", "done");
  if (who !== "all") taskQ = taskQ.eq("assignee", who);
  const [{ data: tasks }, { data: events }, { data: suggestions }, { data: followUps }, { data: activity }, { data: lastSync }] =
    await Promise.all([
      taskQ.order("due_date", { ascending: true, nullsFirst: false }),
      supabase.from("calendar_events").select("*").gte("starts_at", dayStart).lte("starts_at", dayEnd).order("starts_at"),
      supabase.from("suggestions").select("*").eq("status", "pending").order("source_date", { ascending: false }).limit(5),
      supabase.from("follow_ups").select("*, clients(id,name)").is("deleted_at", null).eq("status", "open").order("asked_on"),
      supabase.from("audit_log").select("*").order("changed_at", { ascending: false }).limit(8),
      supabase.from("sync_runs").select("ran_at").order("ran_at", { ascending: false }).limit(1),
    ]);

  const all = (tasks ?? []) as Task[];
  const overdue = all.filter((t) => t.due_date && t.due_date < today);
  const dueToday = all.filter((t) => t.due_date === today);
  const thisWeek = all.filter((t) => t.due_date && t.due_date > today && t.due_date <= weekEnd);
  const waiting = all.filter((t) => t.status === "waiting");
  const noDate = all.filter((t) => !t.due_date && t.status !== "waiting");
  const fu = (followUps ?? []) as FollowUp[];
  const theyWait = fu.filter((f) => f.direction === "they_wait_on_us" && (who === "all" || !f.assignee || f.assignee === who));
  const { count: pendingCount } = await supabase.from("suggestions").select("id", { count: "exact", head: true }).eq("status", "pending");

  const whoLabel = who === "all" ? "Everyone" : firstName(members, who);
  const tiles = [
    { label: "Overdue", n: overdue.length, t: overdue.length ? "bad" : "muted", href: "/tasks?view=overdue" },
    { label: "Due today", n: dueToday.length, t: dueToday.length ? "warn" : "muted", href: "/tasks?view=today" },
    { label: "Rest of this week", n: thisWeek.length, t: "muted", href: "/tasks?view=week" },
    { label: "Waiting on others", n: waiting.length, t: "muted", href: "/tasks?view=waiting" },
    { label: "People waiting on us", n: theyWait.length, t: theyWait.length ? "warn" : "muted", href: "/follow-ups" },
    { label: "Suggestions to review", n: pendingCount ?? 0, t: pendingCount ? "accent" : "muted", href: "/suggestions" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Good {greeting()}, {me.full_name.split(" ")[0]}</h1>
          <p className="text-sm text-[var(--muted)]">
            {fmtDate(today)} · showing {whoLabel === me.full_name.split(" ")[0] ? "your" : `${whoLabel}'s`} to-do
            {lastSync?.[0] && <> · last synced {fmtDateTime(lastSync[0].ran_at)}</>}
          </p>
        </div>
        <div className="flex gap-1 text-sm">
          {[...members.map((m) => ({ v: m.email, l: m.full_name.split(" ")[0] })), { v: "all", l: "Everyone" }].map((o) => (
            <Link key={o.v} href={`/?who=${encodeURIComponent(o.v)}`}
              className={`rounded-lg px-2.5 py-1.5 ${who === o.v ? "bg-[var(--accent-bg)] text-[var(--accent)] font-medium" : "text-[var(--muted)]"}`}>
              {o.l}
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {tiles.map((x) => (
          <Link key={x.label} href={x.href} className="rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-3 hover:border-[var(--accent)]">
            <div className={`text-2xl font-semibold ${x.t === "bad" ? "text-[var(--bad)]" : x.t === "warn" ? "text-[var(--warn)]" : x.t === "accent" ? "text-[var(--accent)]" : ""}`}>{x.n}</div>
            <div className="text-xs text-[var(--muted)]">{x.label}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Card title="To do" action={<Link href="/tasks?new=1" className="text-sm text-[var(--accent)]">+ New task</Link>}>
            <Group label="Overdue" tasks={overdue} members={members} />
            <Group label="Today" tasks={dueToday} members={members} />
            <Group label="Rest of this week" tasks={thisWeek} members={members} />
            <Group label="Waiting on someone" tasks={waiting} members={members} />
            <Group label="No due date" tasks={noDate} members={members} collapsed />
            {all.length === 0 && <Empty>Nothing open. Enjoy it.</Empty>}
          </Card>

          <Card title="People waiting on us" action={<Link href="/follow-ups" className="text-sm text-[var(--accent)]">All follow-ups</Link>}>
            {theyWait.length === 0 ? <Empty>Nobody is waiting.</Empty> : (
              <ul>
                {theyWait.slice(0, 8).map((f) => (
                  <li key={f.id} className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] py-2 last:border-0 text-sm">
                    <span className="flex-1 min-w-0"><b className="font-medium">{f.matter}</b>{f.contact_name && <> · {f.contact_name}</>}<span className="block text-xs text-[var(--muted)]">{f.what}</span></span>
                    {f.asked_on && <Badge t={(daysSince(f.asked_on) ?? 0) > 5 ? "bad" : "warn"}>{daysSince(f.asked_on)} days</Badge>}
                    <Badge>{firstName(members, f.assignee)}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <div className="space-y-6">
          <Card title="Today's calendar" action={<Link href="/calendar" className="text-sm text-[var(--accent)]">Week</Link>}>
            {(events ?? []).length === 0 ? <Empty>No meetings synced for today.</Empty> : (
              <ul className="space-y-2">
                {(events as CalendarEvent[]).map((e) => (
                  <li key={e.id} className="flex gap-3 text-sm">
                    <span className="w-12 shrink-0 tabular-nums text-[var(--muted)]">{e.all_day ? "All day" : fmtTime(e.starts_at)}</span>
                    <span>{e.title}{e.location && <span className="block text-xs text-[var(--muted)]">{e.location}</span>}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="New suggestions" action={<Link href="/suggestions" className="text-sm text-[var(--accent)]">Review</Link>}>
            {(suggestions ?? []).length === 0 ? <Empty>No suggestions waiting.</Empty> : (
              <ul className="space-y-2">
                {(suggestions as Suggestion[]).map((s) => (
                  <li key={s.id} className="text-sm">
                    <div className="flex items-center gap-1.5">
                      <Badge t={s.kind === "task" ? "accent" : "warn"}>{s.kind === "task" ? "Task" : "Follow-up"}</Badge>
                      <SourceBadge source={s.source} />
                    </div>
                    <div className="mt-0.5">{s.title}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Recent activity" action={<Link href="/history" className="text-sm text-[var(--accent)]">History</Link>}>
            {(activity ?? []).length === 0 ? <Empty>No changes yet.</Empty> : (
              <ul className="space-y-2 text-sm">
                {(activity as AuditEntry[]).map((a) => (
                  <li key={a.id}>
                    <span className="font-medium">{a.actor_label}</span> {describeChange(a, members)}
                    <span className="block text-xs text-[var(--muted)]">{fmtDateTime(a.changed_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function Group({ label, tasks, members, collapsed }: { label: string; tasks: Task[]; members: Parameters<typeof TaskRow>[0]["members"]; collapsed?: boolean }) {
  if (tasks.length === 0) return null;
  const body = <ul>{tasks.map((t) => <TaskRow key={t.id} task={t} members={members} />)}</ul>;
  if (collapsed) {
    return (
      <details className="mb-3">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label} ({tasks.length})</summary>
        {body}
      </details>
    );
  }
  return (
    <div className="mb-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label} ({tasks.length})</h3>
      {body}
    </div>
  );
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
