import { requireMember } from "@/lib/session";
import { Card, btnCls, btnGhost, inputCls } from "@/components/ui";
import { changePassword, disconnectGoogle, syncGoogleNow } from "./actions";
import { googleConfigured } from "@/lib/google";
import { fmtDateTime } from "@/lib/dates";
import { nameForUser } from "@/lib/people";

type GoogleStatus = {
  user_id: string; google_email: string; connected_at: string;
  last_gmail_sync: string | null; last_calendar_sync: string | null; last_error: string | null; active: boolean;
};

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { supabase, me, members } = await requireMember();
  const { data: gs } = await supabase.rpc("google_connection_status");
  const connections = ((gs ?? []) as GoogleStatus[]).filter((c) => c.active);
  const mine = connections.find((c) => c.user_id === me.user_id);
  const ready = googleConfigured();
  const sp = await searchParams;
  return (
    <div className="max-w-xl space-y-4">
      <h1 className="text-xl font-semibold">Your account</h1>
      <Card title={`${me.full_name} · ${me.email}`}>
        {sp.error && <p className="mb-3 rounded-lg bg-[var(--bad-bg)] px-3 py-2 text-sm text-[var(--bad)]">{sp.error}</p>}
        {sp.notice && <p className="mb-3 rounded-lg bg-[var(--ok-bg)] px-3 py-2 text-sm text-[var(--ok)]">{sp.notice}</p>}
        <form action={changePassword} className="space-y-2">
          <input name="password" type="password" required minLength={8} placeholder="New password (8+ characters)" className={`${inputCls} w-full`} autoComplete="new-password" />
          <input name="confirm" type="password" required minLength={8} placeholder="Repeat new password" className={`${inputCls} w-full`} autoComplete="new-password" />
          <button className={btnCls}>Change password</button>
        </form>
      </Card>
      <Card title="Gmail and Google Calendar">
        <div className="space-y-3 text-sm">
          <p className="text-[var(--muted)]">
            Each person connects their own mailbox. Once connected, the dashboard reads your inbox, sent mail and calendar (read-only)
            whenever someone opens it, at most every 10 minutes. Emails about an open task or follow-up are matched to it and shown on
            its page; new ones become suggestions that someone has to accept. Nothing is ever sent from here.
          </p>
          {connections.length > 0 && (
            <ul className="space-y-1">
              {connections.map((c) => (
                <li key={c.user_id} className="rounded-lg border border-[var(--line)] px-3 py-2">
                  <div className="font-medium">{c.google_email}</div>
                  <div className="text-xs text-[var(--muted)]">
                    Connected by {nameForUser(members, c.user_id)} · last pull {fmtDateTime(c.last_gmail_sync) || "not yet"}
                  </div>
                  {c.last_error && <div className="mt-1 text-xs text-[var(--bad)]">Last pull failed: {c.last_error}</div>}
                </li>
              ))}
            </ul>
          )}
          {!ready && (
            <p className="rounded-lg bg-[var(--bad-bg)] px-3 py-2 text-[var(--bad)]">
              Waiting on setup: the Google client ID and secret still need to be added in Vercel.
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            {ready && (
              <a href="/api/google/connect" className={btnCls}>{mine ? "Reconnect Google" : "Connect Google"}</a>
            )}
            {connections.length > 0 && (
              <form action={syncGoogleNow}><button className={btnGhost}>Pull now</button></form>
            )}
            {mine && (
              <form action={disconnectGoogle}><button className={btnGhost}>Disconnect</button></form>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
