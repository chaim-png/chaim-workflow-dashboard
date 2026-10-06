/** Matches an email thread to the open tasks and follow-ups it is about. Pure, so it can be tested on its own. */

export type MatchTask = { id: string; title: string; client_id: string | null; source_ref: string | null };
export type MatchFollowUp = { id: string; matter: string; client_id: string | null; contact_email: string | null; source_ref: string | null };
export type MatchClient = { id: string; name: string };
export type MatchThread = { id: string; subject: string; snippet: string; participants: string[] };
export type Match = { task_id?: string; follow_up_id?: string; client_id?: string; matched_by: string };

// Words that appear in many client names or titles and say nothing about which one is meant.
const GENERIC = new Set([
  "the", "and", "for", "with", "from", "into", "unit", "road", "rd", "street", "st", "avenue", "ave", "drive", "dr",
  "lane", "close", "crescent", "place", "estate", "erf", "no", "firzt", "internal", "property", "properties", "pty",
  "ltd", "lease", "rental", "rentals", "sale", "reply", "send", "get", "confirm", "follow", "up", "re", "fwd", "fw",
  "chaim", "nadine", "personal", "admin", "project", "about", "on", "to", "of", "in", "at", "a", "an", "is", "be", "our", "your", "new", "draft",
]);

export const norm = (s: string) => ` ${s.toLowerCase().replace(/&#39;|['’]/g, "").replace(/[^a-z0-9]+/g, " ").trim()} `;
const words = (s: string) => norm(s).trim().split(" ").filter((w) => w && !GENERIC.has(w));

/** A client name matches when its distinctive words appear together, in order, and one of them is a real word. */
export function clientMatches(name: string, text: string) {
  const w = words(name);
  if (!w.length || !w.some((x) => /[a-z]/.test(x) && x.length > 2)) return false;
  return ` ${words(text).join(" ")} `.includes(` ${w.join(" ")} `);
}

/** Distinctive title words (4+ letters, not part of the client's name) that also appear in the email. */
function overlap(title: string, text: string, clientName: string) {
  const t = norm(text);
  const own = new Set(words(clientName));
  return words(title).filter((w) => w.length >= 4 && /[a-z]/.test(w) && !own.has(w) && t.includes(` ${w} `)).length;
}

export function matchThread(
  th: MatchThread,
  tasks: MatchTask[],
  followUps: MatchFollowUp[],
  clients: MatchClient[],
): Match[] {
  const out: Match[] = [];
  const seen = new Set<string>();
  const add = (m: Match) => {
    const key = m.task_id ?? m.follow_up_id ?? m.client_id!;
    if (!seen.has(key)) { seen.add(key); out.push(m); }
  };
  const text = `${th.subject} ${th.snippet}`;
  const people = new Set(th.participants.map((p) => p.toLowerCase()));

  // 1. The task or follow-up was created from this very thread (same mailbox).
  for (const t of tasks) if (t.source_ref === th.id) add({ task_id: t.id, matched_by: "thread" });
  for (const f of followUps) if (f.source_ref === th.id) add({ follow_up_id: f.id, matched_by: "thread" });

  // 2. The follow-up's contact is on the thread, unless the email names a different client
  //    (agents and attorneys often work on several of our matters at once).
  const named = clients.filter((c) => clientMatches(c.name, text));
  const namedIds = new Set(named.map((c) => c.id));
  for (const f of followUps) {
    if (!f.contact_email || !people.has(f.contact_email.toLowerCase())) continue;
    if (namedIds.size && (!f.client_id || !namedIds.has(f.client_id))) continue;
    add({ follow_up_id: f.id, matched_by: "contact" });
  }

  // 3. The client or address is named in the subject or opening lines.
  for (const c of named) {
    const scored = [
      ...tasks.filter((t) => t.client_id === c.id).map((t) => ({ m: { task_id: t.id } as Match, n: overlap(t.title, text, c.name) })),
      ...followUps.filter((f) => f.client_id === c.id).map((f) => ({ m: { follow_up_id: f.id } as Match, n: overlap(f.matter, text, c.name) })),
    ].filter((x) => x.n > 0);
    const best = Math.max(0, ...scored.map((x) => x.n));
    if (best > 0) scored.filter((x) => x.n === best).slice(0, 3).forEach((x) => add({ ...x.m, matched_by: "client+title" }));
    else if (!out.some((m) => m.follow_up_id && followUps.find((f) => f.id === m.follow_up_id)?.client_id === c.id)) {
      add({ client_id: c.id, matched_by: "client" });
    }
  }
  return out;
}
