import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Member } from "@/lib/types";

/** Signed-in user plus team list. Redirects to /login when signed out or not invited. */
export async function requireMember() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  if (!userId) redirect("/login");
  const { data: members } = await supabase.from("team_members").select("*").order("full_name");
  const me = (members as Member[] | null)?.find((m) => m.user_id === userId);
  if (!me) redirect("/login?error=not-invited");
  return { supabase, me, members: (members ?? []) as Member[] };
}
