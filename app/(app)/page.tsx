import Link from "next/link";
import { requireMember } from "@/lib/session";
import { firstName } from "@/lib/people";
import { addDays, dayBoundsUTC, endOfWeekISO, fmtAddress, fmtDate, fmtDateTime, fmtTime, todayISO } from "@/lib/dates";
import type { CalendarEvent, FollowUp, Member, Suggestion, Task, AuditEntry } from "@/lib/types";
import { Badge, Card, Empty, SourceBadge, memberColor } from "@/components/ui";
import { SORTS, TodoTable, eventItem, followUpItem, sortItems, taskItem, withEmails, type SortKey, type TodoItem } from "@/components/todo";
import { describeChange } from "@/lib/audit";
import { Confetti } from "@/components/confetti";

export default async function SummaryPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { supabase, me, members } = await requireMember();
  const sp = await searchParams;
  const who = sp.who === "all" ? "all" : sp.who && members.some((m) => m.email === sp.who) ? sp.who : me.email;
  const urg = sp.u === "urgent" || sp.u === "medium" ? sp.u : "all";
  const show = sp.show === "tasks" || sp.show === "follow_ups" ? sp.show : "all";
  const sort = (SORTS.some((x) => x.v === sp.sort) ? sp.sort : "due") as SortKey;
  const today = todayISO();
  const tomorrow = addDays(today, 1);
  const weekEnd = endOfWeekISO();
  const [dayStart, dayEnd] = dayBoundsUTC(today);
  const owner = members.find((m) => m.role === "owner")?.email ?? null;

  let taskQ = supabase.from("tasks").select("*, clients(id,name)").is("deleted_at", null).neq("status", "done");
  if (who !== "all") taskQ = taskQ.eq("assignee", who);
  const [{ data: tasks }, { data: events }, { data: suggestions }, { data: followUps }, { data: activity }, { data: lastSync }, { data: tracked }] =
    await Promise.all([
      taskQ,
      supabase.from("calendar_events").select("*").gte("starts_at", dayStart).lte("starts_at", dayEnd).order("starts_at"),
      supabase.from("suggestions").select("*").eq("status", "pending").order("source_date", { ascending: false }).limit(5),
      supabase.from("follow_ups").select("*, clients(id,name)").is("deleted_at", null).eq("status", "open").order("asked_on"),
      supabase.from("audit_log").select("*").order("changed_at", { ascending: false }).limit(8),
      supabase.from("sync_runs").select("ran_at").order("ran_at", { ascending: false }).limit(1),
      supabase.from("tasks").select("source_ref").eq("source", "calendar").is("deleted_at", null).gte("due_date", today),
    ]);
  const monthStart = today.slice(0, 8) + "01";
  const monthEnd = addDays(addDays(monthStart, 32).slice(0, 8) + "01", -1);
  const [monthStartUTC] = dayBoundsUTC(monthStart);
  // Everything done this month (today is a subset), and what is still open and due by the end of the month.
  const [{ data: doneMonth }, { data: openMonth }, { data: fuDoneMonth }, { data: fuOpenMonth }] = await Promise.all([
    supabase.from("tasks").select("assignee, completed_at").is("deleted_at", null).eq("status", "done").gte("completed_at", monthStartUTC),
    supabase.from("tasks").select("assignee, due_date").is("deleted_at", null).neq("status", "done").lte("due_date", monthEnd),
    supabase.from("follow_ups").select("assignee, updated_at").is("deleted_at", null).eq("status", "done").gte("updated_at", monthStartUTC),
    supabase.from("follow_ups").select("assignee, next_action_on").is("deleted_at", null).eq("status", "open").lte("next_action_on", monthEnd),
  ]);
  const isToday = (ts: string | null) => !!ts && ts >= dayStart && ts <= dayEnd;
  const people = [...members.map((m) => ({ email: m.email as string | null, name: m.full_name.split(" ")[0], color: memberColor(members, m.email), goal: m.daily_goal ?? 8 })),
    { email: null, name: "Team", color: "var(--accent)", goal: members.reduce((n, m) => n + (m.daily_goal ?? 8), 0) }];
  const meter = (done: number, left: number) => ({ done, left, pct: done + left ? Math.round((done / (done + left)) * 100) : null });
  const barometer = people.map((p) => {
    const mine = (r: { assignee: string | null }) => p.email === null || r.assignee === p.email;
    const tasksDone = (doneMonth ?? []).filter(mine) as { completed_at: string | null }[];
    const fuDone = (fuDoneMonth ?? []).filter(mine) as { updated_at: string | null }[];
    const tasksOpen = (openMonth ?? []).filter(mine) as { due_date: string | null }[];
    const fuOpen = (fuOpenMonth ?? []).filter(mine) as { next_action_on: string | null }[];
    return {
      ...p,
      today: meter(tasksDone.filter((r) => isToday(r.completed_at)).length + fuDone.filter((r) => isToday(r.updated_at)).length,
        tasksOpen.filter((r) => r.due_date! <= today).length + fuOpen.filter((r) => r.next_action_on! <= today).length),
      month: meter(tasksDone.length + fuDone.length, tasksOpen.length + fuOpen.length),
    };
  });
  const monthName = new Date(today + "T12:00:00Z").toLocaleString("en-ZA", { month: "long", timeZone: "UTC" });
  // Fun facts for the barometer: streak, best day, meetings, follow-ups closed.
  const [monthEndUTC] = dayBoundsUTC(addDays(monthEnd, 1));
  const [{ data: recentDone }, { data: monthEvents }] = await Promise.all([
    supabase.from("tasks").select("completed_at").is("deleted_at", null).eq("status", "done").gte("completed_at", dayBoundsUTC(addDays(today, -60))[0]),
    supabase.from("calendar_events").select("starts_at").eq("declined", false).gte("starts_at", monthStartUTC).lt("starts_at", monthEndUTC),
  ]);
  const localDay = (ts: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date(ts));
  const perDay = new Map<string, number>();
  for (const r of (recentDone ?? []) as { completed_at: string | null }[]) {
    if (r.completed_at) perDay.set(localDay(r.completed_at), (perDay.get(localDay(r.completed_at)) ?? 0) + 1);
  }
  // Working days in a row (Saturday skipped) with at least one task done; today only counts once something is done.
  let streak = 0;
  for (let d = perDay.get(today) ? today : addDays(today, -1), i = 0; i < 60; i++, d = addDays(d, -1)) {
    if (new Date(d + "T12:00:00Z").getUTCDay() === 6) continue;
    if (!perDay.get(d)) break;
    streak++;
  }
  const best = [...perDay].filter(([d]) => d >= monthStart).sort((a, b) => b[1] - a[1])[0];
  const meetingsToday = ((events ?? []) as CalendarEvent[]).filter((e) => !e.declined).length;
  const meetingsMonth = (monthEvents ?? []).length;
  const fuClosedMonth = (fuDoneMonth ?? []).length;
  const doneTodayTeam = perDay.get(today) ?? 0;

  // Week starts on Sunday (Shabbos is the day off).
  const weekStart = addDays(today, -new Date(today + "T12:00:00Z").getUTCDay());
  const [weekStartUTC] = dayBoundsUTC(weekStart);
  const [{ data: weekTasks }, { data: weekFus }, { data: monthClosed }, { data: oldestOpen }, { data: links }] = await Promise.all([
    supabase.from("tasks").select("client_id").is("deleted_at", null).eq("status", "done").gte("completed_at", weekStartUTC).not("client_id", "is", null),
    supabase.from("follow_ups").select("client_id").is("deleted_at", null).eq("status", "done").gte("updated_at", weekStartUTC).not("client_id", "is", null),
    supabase.from("tasks").select("title, created_at, completed_at").is("deleted_at", null).eq("status", "done").gte("completed_at", monthStartUTC),
    supabase.from("tasks").select("id, title, created_at").is("deleted_at", null).neq("status", "done").order("created_at").limit(1),
    supabase.from("email_links").select("thread_id, team_wrote_last, last_at"),
  ]);
  const clientsTouched = new Set([...(weekTasks ?? []), ...(weekFus ?? [])].map((r: { client_id: string }) => r.client_id)).size;
  const span = (ms: number) => {
    const h = ms / 3_600_000;
    return h < 1 ? `${Math.max(1, Math.round(h * 60))} min` : h < 48 ? `${Math.round(h)} h` : `${Math.round(h / 24)} days`;
  };
  const fastest = ((monthClosed ?? []) as { title: string; created_at: string; completed_at: string }[])
    .map((t) => ({ title: t.title, ms: new Date(t.completed_at).getTime() - new Date(t.created_at).getTime() }))
    .filter((t) => t.ms >= 0).sort((a, b) => a.ms - b.ms)[0];
  const oldest = (oldestOpen ?? [])[0] as { id: string; title: string; created_at: string } | undefined;
  const oldestDays = oldest ? Math.floor((Date.now() - new Date(oldest.created_at).getTime()) / 86_400_000) : 0;
  // One answer per thread: whoever wrote last on its newest link.
  const threads = new Map<string, { team: boolean; at: string }>();
  for (const l of (links ?? []) as { thread_id: string; team_wrote_last: boolean; last_at: string | null }[]) {
    const prev = threads.get(l.thread_id);
    if (!prev || (l.last_at ?? "") > prev.at) threads.set(l.thread_id, { team: l.team_wrote_last, at: l.last_at ?? "" });
  }
  const answered = [...threads.values()].filter((t) => t.team).length;
  const waitingOnUs = threads.size - answered;
  const cut = (t: string, n = 38) => (t.length > n ? t.slice(0, n - 1) + "…" : t);
  const facts: { n: string | number; l: string; e: string; href?: string; title?: string }[] = [
    { n: doneTodayTeam, l: "done today", e: doneTodayTeam >= 5 ? "🚀" : doneTodayTeam ? "✅" : "☕" },
    { n: streak, l: streak === 1 ? "day streak" : "days streak", e: streak >= 3 ? "🔥" : "📆" },
    { n: best ? best[1] : 0, l: best ? `best day (${fmtDate(best[0])})` : "best day", e: "🏆" },
    { n: meetingsToday, l: meetingsToday === 1 ? "meeting today" : "meetings today", e: "🗓️" },
    { n: meetingsMonth, l: `meetings in ${monthName}`, e: "🤝" },
    { n: fuClosedMonth, l: "follow-ups closed", e: "📨" },
    { n: clientsTouched, l: clientsTouched === 1 ? "client moved forward this week" : "clients moved forward this week", e: "🏠" },
    { n: fastest ? span(fastest.ms) : "–", l: fastest ? `fastest close: ${cut(fastest.title, 30)}` : "fastest close this month", e: "⚡", title: fastest?.title },
    { n: oldest ? `${oldestDays} days` : "–", l: oldest ? `oldest open: ${cut(oldest.title, 30)}` : "oldest open item", e: "🐢", href: oldest ? `/tasks/${oldest.id}` : undefined, title: oldest?.title },
    { n: `${answered} / ${waitingOnUs}`, l: "emails answered / waiting on us", e: "✉️", href: "/follow-ups" },
  ];
  const myToday = barometer.find((b) => b.email === me.email)?.today;
  const range = (sp.bar === "month" ? "month" : "today") as "today" | "month";

  const todaysEvents = ((events ?? []) as CalendarEvent[]).filter((e) => !e.declined);
  const trackedIds = new Set((tracked ?? []).map((t: { source_ref: string }) => t.source_ref));
  const fu = ((followUps ?? []) as FollowUp[]).filter((f) => who === "all" || f.assignee === who || (!f.assignee && who === me.email));
  const urgOk = (u: string) => urg === "all" || u === "urgent" || (urg === "medium" && u === "medium");
  const items: TodoItem[] = [
    ...(show !== "follow_ups" ? ((tasks ?? []) as Task[]).map(taskItem) : []),
    ...(show !== "tasks" ? fu.filter((f) => f.next_action_on).map(followUpItem) : []),
    ...(show !== "follow_ups" && (who === "all" || who === owner)
      ? todaysEvents.filter((e) => !trackedIds.has(e.id)).map((e) => eventItem(e, owner))
      : []),
  ].filter((i) => urgOk(i.urgency) || i.kind === "calendar");
  const sorted = sortItems(await withEmails(supabase, items, members), sort);
  const waitingTask = (i: TodoItem) => i.kind === "task" && i.status === "waiting";
  const overdue = sorted.filter((i) => i.due_date && i.due_date < today && !waitingTask(i));
  const dueToday = sorted.filter((i) => i.due_date === today && !waitingTask(i));
  const dueTomorrow = sorted.filter((i) => i.due_date === tomorrow && !waitingTask(i));
  const thisWeek = sorted.filter((i) => i.due_date && i.due_date > tomorrow && i.due_date <= weekEnd && !waitingTask(i));
  const later = sorted.filter((i) => i.due_date && i.due_date > weekEnd && !waitingTask(i));
  const waiting = sorted.filter(waitingTask);
  const noDate = sorted.filter((i) => !i.due_date && !waitingTask(i));
  const theyWait = fu.filter((f) => f.direction === "they_wait_on_us" && !f.next_action_on).map(followUpItem);
  const { count: pendingCount } = await supabase.from("suggestions").select("id", { count: "exact", head: true }).eq("status", "pending");

  const whoLabel = who === "all" ? "Everyone" : firstName(members, who);
  const tiles = [
    { label: "Overdue", n: overdue.length, t: overdue.length ? "bad" : "muted", href: "#overdue" },
    { label: "Due today", n: dueToday.length, t: dueToday.length ? "warn" : "muted", href: "#today" },
    { label: "Urgent", n: items.filter((i) => i.urgency === "urgent").length, t: items.some((i) => i.urgency === "urgent") ? "bad" : "muted", href: link(sp, { u: "urgent" }) },
    { label: "Tomorrow", n: dueTomorrow.length, t: "muted", href: "#tomorrow" },
    { label: "People waiting on us", n: theyWait.length, t: theyWait.length ? "warn" : "muted", href: "/follow-ups" },
    { label: "Suggestions to review", n: pendingCount ?? 0, t: pendingCount ? "accent" : "muted", href: "/suggestions" },
  ];
  const pill = (active: boolean) => `rounded-lg px-2.5 py-1.5 ${active ? "bg-[var(--accent-bg)] text-[var(--accent)] font-medium" : "text-[var(--muted)] hover:text-[var(--text)]"}`;

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
            <Link key={o.v} href={link(sp, { who: o.v })} className={pill(who === o.v)}>{o.l}</Link>
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

      <Card
        title={range === "month" ? `${monthName} barometer` : "Today's barometer"}
        action={
          <span className="flex gap-1 text-sm">
            <Link href={link(sp, { bar: "" })} className={pill(range === "today")}>Today</Link>
            <Link href={link(sp, { bar: "month" })} className={pill(range === "month")}>This month</Link>
          </span>
        }
      >
        <p className="-mt-1 mb-3 text-xs text-[var(--muted)]">
          {range === "month" ? `Done since 1 ${monthName} vs still open and due by month end` : "Done today vs still due today or overdue"}
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          {barometer.map((b) => {
            const m = b[range];
            const goalHit = range === "today" && m.done >= b.goal;
            return (
              <div key={b.name}>
                <div className="mb-1 flex items-baseline justify-between text-sm">
                  <span className="flex items-center gap-1.5 font-medium">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ background: b.color }} aria-hidden />{b.name}
                  </span>
                  <span className="tabular-nums text-[var(--muted)]">{m.done} done · {m.left} left</span>
                </div>
                <div className="h-2.5 overflow-hidden rounded-full bg-[var(--bg)]" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={m.pct ?? 0}
                  aria-label={`${b.name} completed ${range === "month" ? "this month" : "today"}`}>
                  <div className="h-full rounded-full" style={{ width: `${goalHit ? 100 : m.pct ?? 0}%`, background: goalHit ? "#d69e2e" : b.color }} />
                </div>
                <div className="mt-1 text-xs text-[var(--muted)]">
                  {m.pct === null ? (range === "month" ? "Nothing due this month" : "Nothing due today") : `${m.pct}% complete`}
                  {range === "today" && <span className={goalHit ? "ml-2 font-medium text-[#d69e2e]" : "ml-2"}>{goalHit ? `🏅 Goal hit (${m.done}/${b.goal})` : `🎯 ${m.done}/${b.goal} goal`}</span>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 border-t border-[var(--line)] pt-4 sm:grid-cols-3 lg:grid-cols-5">
          {facts.map((f) => {
            const inner = (
              <>
                <div className="text-lg font-semibold tabular-nums">{f.e} {f.n}</div>
                <div className="truncate text-xs text-[var(--muted)]">{f.l}</div>
              </>
            );
            return f.href ? (
              <Link key={f.l} href={f.href} title={f.title} className="rounded-xl bg-[var(--bg)] px-3 py-2 hover:ring-1 hover:ring-[var(--accent)]">{inner}</Link>
            ) : (
              <div key={f.l} title={f.title} className="rounded-xl bg-[var(--bg)] px-3 py-2">{inner}</div>
            );
          })}
        </div>
        <Confetti fire={!!myToday && myToday.done > 0 && myToday.left === 0} day={today} />
      </Card>

      <div className="space-y-6">
        <div className="space-y-6">
          <Card title="To do" action={<Link href="/tasks?new=1" className="text-sm text-[var(--accent)]">+ New task</Link>}>
            <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
              <span className="flex gap-1">
                {([["all", "Everything"], ["tasks", "Tasks"], ["follow_ups", "Follow-ups"]] as const).map(([v, l]) => (
                  <Link key={v} href={link(sp, { show: v === "all" ? "" : v })} className={pill(show === v)}>{l}</Link>
                ))}
              </span>
              <span className="flex gap-1">
                {([["all", "Any urgency"], ["medium", "Medium and urgent"], ["urgent", "Urgent only"]] as const).map(([v, l]) => (
                  <Link key={v} href={link(sp, { u: v === "all" ? "" : v })} className={pill(urg === v)}>{l}</Link>
                ))}
              </span>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--muted)] lg:ml-auto">Sort by
                <SortSelect sp={sp} sort={sort} />
              </div>
            </div>
            <Group id="overdue" label="Overdue" items={overdue} members={members} me={me.email} />
            <Group id="today" label="Today" items={dueToday} members={members} me={me.email} empty="Nothing due today." />
            <Group id="tomorrow" label="Tomorrow" items={dueTomorrow} members={members} me={me.email} />
            <Group id="week" label="Rest of this week" items={thisWeek} members={members} me={me.email} />
            <Group id="waiting" label="Waiting on someone" items={waiting} members={members} me={me.email} />
            <Group id="later" label="Later" items={later} members={members} me={me.email} collapsed />
            <Group id="nodate" label="No due date" items={noDate} members={members} me={me.email} collapsed />
            {items.length === 0 && <Empty>Nothing open. Enjoy it.</Empty>}
          </Card>

          <Card title="People waiting on us (no chase date yet)" action={<Link href="/follow-ups" className="text-sm text-[var(--accent)]">All follow-ups</Link>}>
            <TodoTable items={theyWait.slice(0, 10)} members={members} me={me.email} empty="Nobody is waiting." />
          </Card>
        </div>

        <div className="grid items-start gap-6 md:grid-cols-3">
          <Card title="Today's calendar" action={<Link href="/calendar" className="text-sm text-[var(--accent)]">Week</Link>}>
            {todaysEvents.length === 0 ? <Empty>No meetings synced for today.</Empty> : (
              <ul className="space-y-2">
                {todaysEvents.map((e) => (
                  <li key={e.id} className="flex gap-3 text-sm">
                    <span className="w-12 shrink-0 tabular-nums text-[var(--muted)]">{e.all_day ? "All day" : fmtTime(e.starts_at)}</span>
                    <span className="min-w-0">
                      {e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="hover:text-[var(--accent)]">{e.title}</a> : e.title}
                      {trackedIds.has(e.id) && <span className="ml-1.5"><Badge t="ok">Tracked</Badge></span>}
                      {e.location && <span className="block truncate text-xs text-[var(--muted)]">{fmtAddress(e.location)}</span>}
                    </span>
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

function Group({ id, label, items, members, me, collapsed, empty }: {
  id: string; label: string; items: TodoItem[]; members: Member[]; me: string; collapsed?: boolean; empty?: string;
}) {
  if (items.length === 0 && !empty) return null;
  const heading = <>{label} <span className="font-normal">({items.length})</span></>;
  const body = <TodoTable items={items} members={members} me={me} empty={empty} />;
  if (collapsed) {
    return (
      <details id={id} className="mb-4 scroll-mt-20">
        <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{heading}</summary>
        <div className="mt-2">{body}</div>
      </details>
    );
  }
  return (
    <div id={id} className="mb-5 scroll-mt-20">
      <h3 className={`mb-1 text-xs font-semibold uppercase tracking-wide ${id === "overdue" ? "text-[var(--bad)]" : id === "today" ? "text-[var(--warn)]" : "text-[var(--muted)]"}`}>{heading}</h3>
      {body}
    </div>
  );
}

function link(sp: Record<string, string | undefined>, patch: Record<string, string>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v) p.set(k, v);
  const q = p.toString();
  return q ? `/?${q}` : "/";
}

function SortSelect({ sp, sort }: { sp: Record<string, string | undefined>; sort: SortKey }) {
  return (
    <span className="flex gap-1">
      {SORTS.map((x) => (
        <Link key={x.v} href={link(sp, { sort: x.v === "due" ? "" : x.v })}
          className={`rounded-md px-2 py-1 ${sort === x.v ? "bg-[var(--accent-bg)] text-[var(--accent)] font-medium" : "hover:text-[var(--text)]"}`}>{x.l}</Link>
      ))}
    </span>
  );
}

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-ZA", { timeZone: "Africa/Johannesburg", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "morning" : h < 17 ? "afternoon" : "evening";
}
