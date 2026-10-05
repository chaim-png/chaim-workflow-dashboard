import { signIn, signUp, sendReset } from "./actions";

const input =
  "w-full rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm outline-none focus:border-[var(--accent)]";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const mode = sp.mode ?? "signin";
  const email = sp.email ?? "";
  const error =
    sp.error === "not-invited" ? "This account isn't on the team list. Ask Chaim to add your email." : sp.error;
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--line)] bg-[var(--panel)] p-6 shadow-sm">
        <h1 className="text-lg font-semibold">Chaim&apos;s Work Flow</h1>
        <p className="mb-5 text-sm text-[var(--muted)]">
          {mode === "signup" ? "Create your account" : mode === "reset" ? "Reset your password" : "Sign in"}
        </p>
        {error && <p className="mb-4 rounded-lg bg-[var(--bad-bg)] px-3 py-2 text-sm text-[var(--bad)]">{error}</p>}
        {sp.notice && <p className="mb-4 rounded-lg bg-[var(--ok-bg)] px-3 py-2 text-sm text-[var(--ok)]">{sp.notice}</p>}

        {mode === "signin" && (
          <form action={signIn} className="space-y-3">
            <input name="email" type="email" required placeholder="Email" defaultValue={email} className={input} autoComplete="email" />
            <input name="password" type="password" required placeholder="Password" className={input} autoComplete="current-password" />
            <button className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white">Sign in</button>
          </form>
        )}
        {mode === "signup" && (
          <form action={signUp} className="space-y-3">
            <input name="email" type="email" required placeholder="Your work email" defaultValue={email} className={input} autoComplete="email" />
            <input name="password" type="password" required minLength={8} placeholder="Choose a password (8+ characters)" className={input} autoComplete="new-password" />
            <input name="confirm" type="password" required minLength={8} placeholder="Repeat password" className={input} autoComplete="new-password" />
            <button className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white">Create account</button>
            <p className="text-xs text-[var(--muted)]">Only invited emails can create an account.</p>
          </form>
        )}
        {mode === "reset" && (
          <form action={sendReset} className="space-y-3">
            <input name="email" type="email" required placeholder="Email" defaultValue={email} className={input} />
            <button className="w-full rounded-lg bg-[var(--accent)] px-3 py-2 text-sm font-medium text-white">Email me a reset link</button>
          </form>
        )}

        <div className="mt-5 flex justify-between text-sm text-[var(--accent)]">
          {mode !== "signin" && <a href="/login">Sign in</a>}
          {mode !== "signup" && <a href="/login?mode=signup">First time? Create account</a>}
          {mode === "signin" && <a href="/login?mode=reset">Forgot password</a>}
        </div>
      </div>
    </main>
  );
}
