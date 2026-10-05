"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return `${proto}://${host}`;
}

function back(mode: string, params: Record<string, string>): never {
  const q = new URLSearchParams({ mode, ...params });
  redirect(`/login?${q}`);
}

export async function signIn(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    const msg = /confirm/i.test(error.message)
      ? "Please confirm your email first: open the link we emailed you."
      : "That email and password don't match.";
    back("signin", { error: msg, email });
  }
  redirect("/");
}

export async function signUp(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");
  const confirm = String(fd.get("confirm") ?? "");
  if (password.length < 8) back("signup", { error: "Use at least 8 characters for your password.", email });
  if (password !== confirm) back("signup", { error: "The two passwords don't match.", email });
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${await origin()}/auth/confirm` },
  });
  if (error) {
    const msg = /invited|database error/i.test(error.message)
      ? "This email hasn't been invited to the dashboard. Ask Chaim to add you."
      : error.message;
    back("signup", { error: msg, email });
  }
  if (data.session) redirect("/");
  back("signin", { notice: "Account created. Check your inbox for a confirmation link, then sign in here.", email });
}

export async function sendReset(fd: FormData) {
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${await origin()}/auth/confirm?next=/account` });
  back("signin", { notice: "If that email has an account, a reset link is on its way.", email });
}
