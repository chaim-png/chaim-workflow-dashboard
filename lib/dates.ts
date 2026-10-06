export const TZ = "Africa/Johannesburg";

/** YYYY-MM-DD for "now" in Johannesburg. */
export function todayISO(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Sunday that ends the current week (weeks run Mon to Sun). */
export function endOfWeekISO(): string {
  const t = todayISO();
  const dow = new Date(t + "T12:00:00Z").getUTCDay(); // 0 = Sunday
  return addDays(t, dow === 0 ? 0 : 7 - dow);
}

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? iso + "T12:00:00Z" : iso);
  return new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, weekday: "short", day: "numeric", month: "short" }).format(d);
}

export function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-ZA", {
    timeZone: TZ, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false,
  }).format(new Date(iso));
}

export function fmtTime(iso: string): string {
  return new Intl.DateTimeFormat("en-ZA", { timeZone: TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));
}

export function daysSince(iso: string | null): number | null {
  if (!iso) return null;
  const a = new Date(todayISO() + "T12:00:00Z").getTime();
  const b = new Date(iso.slice(0, 10) + "T12:00:00Z").getTime();
  return Math.round((a - b) / 86400000);
}

/** Start and end (UTC ISO) of a Johannesburg calendar day. SAST is UTC+2 all year. */
export function dayBoundsUTC(iso: string): [string, string] {
  return [new Date(iso + "T00:00:00+02:00").toISOString(), new Date(iso + "T23:59:59+02:00").toISOString()];
}

/** "14:00" from a Postgres time ("14:00:00"). */
export function hhmm(t: string | null | undefined): string {
  return t ? t.slice(0, 5) : "";
}

/** Short, readable due label: "Today 14:00", "Tomorrow", "Overdue 3 days", "Thu 9 Oct 10:30". */
export function dueLabel(date: string | null, time?: string | null, done = false): { text: string; tone: "bad" | "warn" | "muted" | "accent" } {
  if (!date) return { text: "No date", tone: "muted" };
  const today = todayISO();
  const t = time ? ` ${hhmm(time)}` : "";
  if (done) return { text: `${fmtDate(date)}${t}`, tone: "muted" };
  if (date < today) {
    const n = daysSince(date) ?? 0;
    return { text: `Overdue ${n} day${n === 1 ? "" : "s"}`, tone: "bad" };
  }
  if (date === today) return { text: `Today${t}`, tone: "warn" };
  if (date === addDays(today, 1)) return { text: `Tomorrow${t}`, tone: "accent" };
  return { text: `${fmtDate(date)}${t}`, tone: "muted" };
}

/** Johannesburg date (YYYY-MM-DD) of a timestamp. */
export function localDate(iso: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date(iso));
}

/** One-line address: joins lines, drops the country and postal codes. */
export function fmtAddress(a: string | null | undefined): string {
  if (!a) return "";
  return a
    .split(/\n|,/)
    .map((p) => p.trim())
    .filter((p) => p && !/^south africa$/i.test(p) && !/^\d{4}$/.test(p) && !/^(gp|gauteng)$/i.test(p))
    .slice(0, 3)
    .join(", ");
}
