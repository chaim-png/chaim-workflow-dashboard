import { NextResponse, type NextRequest } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

// Landing page for email confirmation and password-reset links.
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const next = url.searchParams.get("next") ?? "/";
  const code = url.searchParams.get("code");
  const tokenHash = url.searchParams.get("token_hash");
  const type = url.searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();

  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;

  if (ok) return NextResponse.redirect(new URL(next, url.origin));
  // The link may have been opened on another device: the email is still confirmed, so ask them to sign in.
  const login = new URL("/login", url.origin);
  login.searchParams.set("notice", "Your email is confirmed. Please sign in.");
  return NextResponse.redirect(login);
}
