import Link from "next/link";
import { after } from "next/server";
import { syncGoogle } from "@/lib/google-sync";
import { requireMember } from "@/lib/session";
import { signOut } from "@/app/actions";
import { NavLinks } from "@/components/nav-links";
import { DueSoon, type DueSoonItem } from "@/components/due-soon";
import { todayISO } from "@/lib/dates";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, me } = await requireMember();
  const { count } = await supabase
    .from("suggestions")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  const today = todayISO();
  const [{ data: myTasks }, { data: myFollowUps }] = await Promise.all([
    supabase.from("tasks").select("id,title,due_date,due_time,priority").is("deleted_at", null).neq("status", "done")
      .eq("assignee", me.email).lte("due_date", today),
    supabase.from("follow_ups").select("id,matter,next_action_on,next_action_time,urgency").is("deleted_at", null).eq("status", "open")
      .eq("assignee", me.email).lte("next_action_on", today),
  ]);
  const dueSoon: DueSoonItem[] = [
    ...(myTasks ?? []).map((t) => ({ key: `t:${t.id}:${t.due_date}:${t.due_time ?? ""}`, title: t.title, href: `/tasks/${t.id}`, due_date: t.due_date, due_time: t.due_time, urgency: t.priority })),
    ...(myFollowUps ?? []).map((f) => ({ key: `f:${f.id}:${f.next_action_on}:${f.next_action_time ?? ""}`, title: `Follow up: ${f.matter}`, href: `/follow-ups/${f.id}`, due_date: f.next_action_on, due_time: f.next_action_time, urgency: f.urgency })),
  ];
  // Keep Gmail and Calendar fresh: after the page is sent, pull if the last pull is over 10 minutes old.
  after(() => syncGoogle(supabase).catch(() => {}));

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
      <DueSoon items={dueSoon} />
    </div>
  );
}
