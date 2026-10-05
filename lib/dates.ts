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
