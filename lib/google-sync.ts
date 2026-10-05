import type { SupabaseClient } from "@supabase/supabase-js";
import { accessTokenFor, googleConfigured, googleGet } from "@/lib/google";
import { addDays, todayISO } from "@/lib/dates";

const STALE_MINUTES = 10;

// Daily routine items Chaim doesn't want on the dashboard calendar.
const ROUTINE = /shacharis|beis midrash|\bgym\b|halacha|chasidus|training video|gemara|shiur|learning|leah time|shabbos prep|mikva.*yitzchak/i;
// Senders that are never a person waiting on us.
const NOT_A_PERSON = /no-?reply|do-?not-?reply|notifications?@|mailer|newsletter|automated@|marketing@|news@|support@|billing@|receipts?@|alerts?@/i;

type Connection = {
  user_id: string;
  google_email: string;
  refresh_token_enc: string;
  last_gmail_sync: string | null;
  last_calendar_sync: string | null;
};

export type SyncResult = { email: string; events: number; suggestions: number; error?: string };

/** Pull Gmail and Calendar for every connected account. Skips accounts synced in the last few minutes unless forced. */
export async function syncGoogle(supabase: SupabaseClient, opts: { force?: boolean } = {}): Promise<SyncResult[]> {
  if (!googleConfigured()) return [];
  const { data, error } = await supabase.rpc("get_google_connections");
  if (error || !data) return [];
  const cutoff = Date.now() - STALE_MINUTES * 60_000;
  const results: SyncResult[] = [];
  for (const c of data as Connection[]) {
    const last = Math.min(
      c.last_gmail_sync ? Date.parse(c.last_gmail_sync) : 0,
      c.last_calendar_sync ? Date.parse(c.last_calendar_sync) : 0,
    );
    if (!opts.force && last > cutoff) continue;
    // Claim the run first so two page loads don't both pull.
    await supabase.rpc("mark_google_sync", { p_user: c.user_id, p_gmail: true, p_calendar: true, p_error: null });
    const r: SyncResult = { email: c.google_email, events: 0, suggestions: 0 };
    try {
      const token = await accessTokenFor(c.refresh_token_enc);
      r.events = await syncCalendar(supabase, token, c.google_email);
      r.suggestions = await syncGmail(supabase, token, c.google_email, c.last_gmail_sync);
      await supabase.from("sync_runs").insert([
        { source: "calendar-live", items_found: r.events, notes: `Live pull from ${c.google_email}` },
        { source: "gmail-live", items_found: r.suggestions, notes: `Live pull from ${c.google_email}: ${r.suggestions} new suggestion(s)` },
      ]);
    } catch (e) {
      r.error = e instanceof Error ? e.message : String(e);
      await supabase.rpc("mark_google_sync", { p_user: c.user_id, p_gmail: false, p_calendar: false, p_error: r.error.slice(0, 500) });
    }
    results.push(r);
  }
  return results;
}

type GEvent = {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: { email?: string; displayName?: string; self?: boolean }[];
};

async function syncCalendar(supabase: SupabaseClient, token: string, email: string) {
  const p = new URLSearchParams({
    timeMin: new Date().toISOString(),
    timeMax: new Date(Date.now() + 14 * 86_400_000).toISOString(),
    singleEvents: "true",
    orderBy: "startTime",
    maxResults: "250",
    timeZone: "Africa/Johannesburg",
  });
  const res = await googleGet<{ items?: GEvent[] }>(token, `https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`);
  const rows = (res.items ?? [])
    .filter((e) => e.status !== "cancelled" && !ROUTINE.test(e.summary ?? ""))
    .map((e) => {
      const allDay = !e.start?.dateTime;
      const attendees = (e.attendees ?? [])
        .filter((a) => !a.self)
        .map((a) => a.displayName || a.email?.split("@")[0])
        .filter(Boolean)
        .slice(0, 8)
        .join(", ");
      return {
        id: e.id,
        title: e.summary || "(no title)",
        starts_at: e.start?.dateTime ?? `${e.start?.date}T00:00:00+02:00`,
        ends_at: e.end?.dateTime ?? (e.end?.date ? `${e.end.date}T00:00:00+02:00` : null),
        all_day: allDay,
        location: e.location ?? null,
        attendees: attendees || null,
        url: e.htmlLink ? `${e.htmlLink}${e.htmlLink.includes("?") ? "&" : "?"}authuser=${encodeURIComponent(email)}` : null,
        synced_at: new Date().toISOString(),
      };
    });
  if (rows.length) {
    const { error } = await supabase.from("calendar_events").upsert(rows, { onConflict: "id" });
    if (error) throw new Error(`Calendar save failed: ${error.message}`);
  }
  return rows.length;
}

type GHeader = { name: string; value: string };
type GMessage = { id: string; labelIds?: string[]; snippet?: string; internalDate?: string; payload?: { headers?: GHeader[] } };
type GThread = { id: string; messages?: GMessage[] };

const header = (m: GMessage, name: string) =>
  m.payload?.headers?.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";

function parseAddress(v: string) {
  const m = v.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>/);
  if (m) return { name: m[1].trim() || m[2], email: m[2].trim().toLowerCase() };
  return { name: v.trim(), email: v.trim().toLowerCase() };
}

function decodeEntities(s: string) {
  return s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}

async function syncGmail(supabase: SupabaseClient, token: string, email: string, lastSync: string | null) {
  // Look back to the previous pull (with an hour of overlap), or two days on the first run.
  const since = lastSync ? Date.parse(lastSync) - 3_600_000 : Date.now() - 2 * 86_400_000;
  const q = `in:inbox -category:promotions -category:social -category:updates -category:forums after:${Math.floor(since / 1000)}`;
  const list = await googleGet<{ threads?: { id: string }[] }>(
    token,
    `https://gmail.googleapis.com/gmail/v1/users/me/threads?${new URLSearchParams({ q, maxResults: "30" })}`,
  );
  const ids = (list.threads ?? []).map((t) => t.id);
  if (!ids.length) return 0;

  const { data: members } = await supabase.from("team_members").select("email").neq("role", "removed");
  const memberEmails = new Set((members ?? []).map((m: { email: string }) => m.email.toLowerCase()));
  const team = new Set([...memberEmails, email.toLowerCase()]);

  // Anything already on the dashboard for these threads is left alone.
  const known = new Set<string>();
  for (const table of ["suggestions", "tasks", "follow_ups"] as const) {
    const { data } = await supabase.from(table).select("source_ref").eq("source", "email").in("source_ref", ids);
    (data ?? []).forEach((r: { source_ref: string }) => known.add(r.source_ref));
  }

  const { data: clients } = await supabase.from("clients").select("name").is("deleted_at", null);
  const clientNames = (clients ?? []).map((c: { name: string }) => c.name);

  const rows = [];
  for (const id of ids.filter((i) => !known.has(i))) {
    const metaHeaders = ["From", "To", "Cc", "Subject", "List-Unsubscribe", "List-Id"];
    const qs = new URLSearchParams({ format: "metadata" });
    metaHeaders.forEach((h) => qs.append("metadataHeaders", h));
    const t = await googleGet<GThread>(token, `https://gmail.googleapis.com/gmail/v1/users/me/threads/${id}?${qs}`);
    const msgs = t.messages ?? [];
    const last = msgs[msgs.length - 1];
    if (!last) continue;
    const from = parseAddress(header(last, "From"));
    const labels = last.labelIds ?? [];
    const subject = header(last, "Subject").replace(/^((re|fwd?|fw)\s*:\s*)+/i, "").trim() || "(no subject)";
    const snippet = decodeEntities(last.snippet ?? "").slice(0, 400);
    const sourceDate = last.internalDate ? new Date(Number(last.internalDate)).toISOString() : null;
    const url = `https://mail.google.com/mail/?authuser=${encodeURIComponent(email)}#all/${id}`;
    const client = clientNames.find((n) => subject.toLowerCase().includes(n.toLowerCase())) ?? null;

    // Property24 enquiries are leads to answer, even though they come from a no-reply address.
    if (/property24\.com$/.test(from.email) && /contact request/i.test(subject)) {
      const ref = subject.match(/P24-\d+/)?.[0] ?? "listing";
      rows.push({
        kind: "task", title: `Reply to Property24 enquiry ${ref}`, details: snippet,
        client_name: client, suggested_assignee: memberEmails.has(email.toLowerCase()) ? email.toLowerCase() : null, suggested_due: addDays(todayISO(), 1),
        source: "email", source_ref: id, source_url: url, source_date: sourceDate,
      });
      continue;
    }

    if (team.has(from.email) || labels.includes("SENT")) continue; // we wrote last
    if (NOT_A_PERSON.test(from.email)) continue;
    if (msgs.some((m) => header(m, "List-Unsubscribe") || header(m, "List-Id"))) continue; // newsletters, lists
    const recipients = `${header(last, "To")},${header(last, "Cc")}`.toLowerCase();
    if (![...team].some((e) => recipients.includes(e))) continue; // broadcasts to group lists
    if (!labels.includes("UNREAD") && !labels.includes("IMPORTANT")) continue;

    const first = from.name.split(/\s+/)[0];
    rows.push({
      kind: "follow_up",
      title: `Reply to ${from.name}: ${subject}`.slice(0, 140),
      details: snippet,
      client_name: client,
      contact_name: from.name,
      contact_email: from.email,
      suggested_assignee: memberEmails.has("nadine@firzt.co.za") ? "nadine@firzt.co.za" : null,
      suggested_due: addDays(todayISO(), 1),
      draft: `To: ${from.email}\nCc: ${email}\nSubject: Re: ${subject}\n\nHi ${first}\n\n\n\nThanks\nNadine`,
      source: "email", source_ref: id, source_url: url, source_date: sourceDate,
    });
  }
  if (!rows.length) return 0;
  const { data: inserted, error } = await supabase
    .from("suggestions")
    .upsert(rows, { onConflict: "kind,source,source_ref,title", ignoreDuplicates: true })
    .select("id");
  if (error) throw new Error(`Saving suggestions failed: ${error.message}`);
  return inserted?.length ?? 0;
}
