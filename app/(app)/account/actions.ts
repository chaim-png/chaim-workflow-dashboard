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

export async function syncGoogleNow() {
  const { syncGoogle } = await import("@/lib/google-sync");
  const supabase = await createClient();
  const results = await syncGoogle(supabase, { force: true });
  if (!results.length) redirect("/account?error=" + encodeURIComponent("No Google account is connected yet."));
  const failed = results.find((r) => r.error);
  if (failed) redirect("/account?error=" + encodeURIComponent(`Pull from ${failed.email} failed: ${failed.error}`));
  const events = results.reduce((n, r) => n + r.events, 0);
  const sugg = results.reduce((n, r) => n + r.suggestions, 0);
  redirect("/account?notice=" + encodeURIComponent(`Pulled ${events} calendar events and ${sugg} new email suggestions.`));
}

export async function disconnectGoogle() {
  const supabase = await createClient();
  const { error } = await supabase.rpc("disconnect_google");
  if (error) redirect("/account?error=" + encodeURIComponent(error.message));
  redirect("/account?notice=" + encodeURIComponent("Google disconnected. The dashboard no longer reads your Gmail or Calendar."));
}

export async function setColour(fd: FormData) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_color", { p_email: String(fd.get("email") ?? ""), p_color: String(fd.get("color") ?? "") });
  if (error) redirect("/account?error=" + encodeURIComponent(error.message));
  redirect("/account?notice=" + encodeURIComponent("Colour saved."));
}
