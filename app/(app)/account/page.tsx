import { requireMember } from "@/lib/session";
import { Card, btnCls, inputCls } from "@/components/ui";
import { changePassword } from "./actions";

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const { me } = await requireMember();
  const sp = await searchParams;
  return (
    <div className="max-w-md space-y-4">
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
    </div>
  );
}
