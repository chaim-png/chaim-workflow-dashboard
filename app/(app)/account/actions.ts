"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function changePassword(fd: FormData) {
  const password = String(fd.get("password") ?? "");
  if (password.length < 8) redirect("/account?error=" + encodeURIComponent("Use at least 8 characters."));
  if (password !== String(fd.get("confirm") ?? "")) redirect("/account?error=" + encodeURIComponent("The two passwords don't match."));
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) redirect("/account?error=" + encodeURIComponent(error.message));
  redirect("/account?notice=" + encodeURIComponent("Password changed."));
}
