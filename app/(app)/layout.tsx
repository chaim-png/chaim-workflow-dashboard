import Link from "next/link";
import { requireMember } from "@/lib/session";
import { signOut } from "@/app/actions";
import { NavLinks } from "@/components/nav-links";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, me } = await requireMember();
  const { count } = await supabase
    .from("suggestions")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-[var(--line)] bg-[var(--panel)]/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
          <Link href="/" className="font-semibold">Chaim&apos;s Work Flow</Link>
          <NavLinks pending={count ?? 0} />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <Link href="/account" className="text-[var(--muted)] hover:text-[var(--text)]">{me.full_name}</Link>
            <form action={signOut}><button className="text-[var(--muted)] hover:text-[var(--text)]">Sign out</button></form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
