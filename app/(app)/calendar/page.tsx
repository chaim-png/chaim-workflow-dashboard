import { requireMember } from "@/lib/session";
import { addDays, dayBoundsUTC, fmtDate, fmtDateTime, fmtTime, todayISO } from "@/lib/dates";
import type { CalendarEvent, Meeting } from "@/lib/types";
import { Badge, Card, Empty } from "@/components/ui";

export default async function CalendarPage() {
  const { supabase } = await requireMember();
  const today = todayISO();
  const [start] = dayBoundsUTC(today);
  const [, end] = dayBoundsUTC(addDays(today, 13));
  const [{ data: events }, { data: meetings }] = await Promise.all([
    supabase.from("calendar_events").select("*").gte("starts_at", start).lte("starts_at", end).order("starts_at"),
    supabase.from("meetings").select("*").order("occurred_at", { ascending: false }).limit(20),
  ]);
  const byDay = new Map<string, CalendarEvent[]>();
  for (const e of (events ?? []) as CalendarEvent[]) {
    const d = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date(e.starts_at));
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Calendar and meetings</h1>
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Next two weeks (Google Calendar)">
          {byDay.size === 0 ? <Empty>No events synced yet.</Empty> : (
            <div className="space-y-4">
              {[...byDay.entries()].map(([d, evs]) => (
                <div key={d}>
                  <h3 className={`text-xs font-semibold uppercase tracking-wide ${d === today ? "text-[var(--accent)]" : "text-[var(--muted)]"}`}>{d === today ? "Today" : fmtDate(d)}</h3>
                  <ul className="mt-1 space-y-1">
                    {evs.map((e) => (
                      <li key={e.id} className="flex gap-3 text-sm">
                        <span className="w-12 shrink-0 tabular-nums text-[var(--muted)]">{e.all_day ? "All day" : fmtTime(e.starts_at)}</span>
                        <span>{e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="hover:text-[var(--accent)]">{e.title}</a> : e.title}
                          {(e.location || e.attendees) && <span className="block text-xs text-[var(--muted)]">{[e.location, e.attendees].filter(Boolean).join(" · ")}</span>}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </Card>
        <Card title="Recent meetings (Granola and Plaud)">
          {(meetings ?? []).length === 0 ? <Empty>No meetings synced yet.</Empty> : (
            <ul className="space-y-4">
              {((meetings ?? []) as Meeting[]).map((m) => (
                <li key={m.id} className="text-sm">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <Badge t="info">{m.source === "granola" ? "Granola" : "Plaud"}</Badge>
                    <span className="font-medium">{m.url ? <a href={m.url} target="_blank" rel="noreferrer">{m.title} ↗</a> : m.title}</span>
                    <span className="text-xs text-[var(--muted)]">{fmtDateTime(m.occurred_at)}</span>
                  </div>
                  {m.summary && <p className="mt-1 text-[var(--muted)]">{m.summary}</p>}
                  {m.action_items?.length > 0 && (
                    <ul className="mt-1 list-disc pl-5">
                      {m.action_items.map((a, i) => <li key={i}>{a.text}{a.owner && <span className="text-[var(--muted)]"> · {a.owner}</span>}</li>)}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
