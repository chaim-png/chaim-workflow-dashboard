import { fmtDateTime } from "@/lib/dates";
import { firstName } from "@/lib/people";
import type { Member } from "@/lib/types";
import { Badge, Card, Empty } from "@/components/ui";

export type EmailLink = {
  id: string; mailbox: string; thread_id: string; subject: string | null; last_from: string | null; last_from_name: string | null;
  team_wrote_last: boolean; last_at: string | null; snippet: string | null; url: string | null; matched_by: string;
  task_id: string | null; follow_up_id: string | null; client_id: string | null;
};

const HOW: Record<string, string> = {
  thread: "created from this email", contact: "same contact", "client+title": "same client and subject", client: "same client",
};

/** Emails from Chaim's and Nadine's mailboxes that were matched to this item (newest first). */
export function EmailLinksCard({ links, members, clientLinks = [] }: { links: EmailLink[]; members: Member[]; clientLinks?: EmailLink[] }) {
  const all = dedupe([...links, ...clientLinks]).sort((a, b) => (b.last_at ?? "").localeCompare(a.last_at ?? ""));
  return (
    <Card title={`Related emails (${all.length})`}>
      {all.length === 0 ? <Empty>No matching emails yet. Emails in Chaim&apos;s and Nadine&apos;s mailboxes are matched as they arrive.</Empty> : (
        <ul className="space-y-3 text-sm">
          {all.slice(0, 12).map((l) => {
            const who = members.find((m) => m.email === l.last_from)?.full_name.split(" ")[0] ?? l.last_from_name ?? l.last_from;
            return (
              <li key={l.id} className="border-l-2 border-[var(--line)] pl-3">
                <div className="flex flex-wrap items-center gap-1.5">
                  {l.url ? <a href={l.url} target="_blank" rel="noreferrer" className="font-medium hover:text-[var(--accent)]">{l.subject ?? "(no subject)"} ↗</a>
                    : <span className="font-medium">{l.subject}</span>}
                  {l.team_wrote_last ? <Badge t="ok">{who} replied</Badge> : <Badge t="warn">waiting on us</Badge>}
                </div>
                {l.snippet && <p className="mt-0.5 line-clamp-2 text-xs text-[var(--muted)]">{l.snippet}</p>}
                <div className="text-xs text-[var(--muted)]">
                  Last from {who} · {fmtDateTime(l.last_at)} · in {firstName(members, l.mailbox)}&apos;s mailbox · {HOW[l.matched_by] ?? l.matched_by}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function dedupe(links: EmailLink[]) {
  // The same email in both mailboxes shows once, preferring the newer copy.
  const seen = new Map<string, EmailLink>();
  for (const l of links) {
    const key = `${(l.subject ?? "").toLowerCase()}|${l.last_from}|${(l.last_at ?? "").slice(0, 16)}`;
    if (!seen.has(key)) seen.set(key, l);
  }
  return [...seen.values()];
}
