/** Splits a draft written as "To: …\nCc: …\nSubject: …\n\nbody" into its parts. */
export function parseDraft(draft: string | null | undefined) {
  const out = { to: "", cc: "", subject: "", body: draft ?? "" };
  if (!draft) return out;
  const lines = draft.split("\n");
  let i = 0;
  for (; i < lines.length; i++) {
    const m = lines[i].match(/^(To|Cc|Subject):\s*(.*)$/i);
    if (!m) break;
    out[m[1].toLowerCase() as "to" | "cc" | "subject"] = m[2].trim();
  }
  if (i > 0) out.body = lines.slice(i).join("\n").replace(/^\n+/, "");
  return out;
}

/** Gmail compose window prefilled for the person to review, edit and send themselves. */
export function gmailCompose(opts: { to?: string | null; cc?: string | null; subject?: string | null; body?: string | null; account?: string | null }) {
  const p = new URLSearchParams({ view: "cm", fs: "1" });
  if (opts.to) p.set("to", opts.to);
  if (opts.cc) p.set("cc", opts.cc);
  if (opts.subject) p.set("su", opts.subject);
  if (opts.body) p.set("body", opts.body);
  if (opts.account) p.set("authuser", opts.account);
  return `https://mail.google.com/mail/?${p}`;
}

/** Compose link for a follow-up: uses its draft when there is one, otherwise a short chaser. */
export function followUpCompose(f: { matter: string; contact_name: string | null; contact_email: string | null; draft: string | null; what?: string | null }, account?: string | null) {
  const d = parseDraft(f.draft);
  const first = (f.contact_name ?? "").split(/\s+/)[0];
  const body = f.draft ? d.body : `Hi${first ? ` ${first}` : ""}\n\nJust following up on ${f.what ?? f.matter}. Please let me know where this stands.\n\nThanks`;
  return gmailCompose({ to: d.to || f.contact_email, cc: d.cc, subject: d.subject || `Re: ${f.matter}`, body, account });
}
