import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { GOOGLE_SCOPES, emailFromIdToken, encryptToken, exchangeCode } from "@/lib/google";
import { syncGoogle } from "@/lib/google-sync";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  const back = (key: "error" | "notice", msg: string) => {
    const res = NextResponse.redirect(`${origin}/account?${key}=${encodeURIComponent(msg)}`);
    res.cookies.delete({ name: "google_oauth_state", path: "/api/google" });
    return res;
  };
  const sp = req.nextUrl.searchParams;
  if (sp.get("error")) return back("error", `Google sign-in was cancelled (${sp.get("error")}).`);
  const state = req.cookies.get("google_oauth_state")?.value;
  if (!state || state !== sp.get("state")) return back("error", "That Google sign-in link expired. Please try Connect Google again.");

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.redirect(`${origin}/login`);

  try {
    const t = await exchangeCode(sp.get("code") ?? "", origin);
    if (!t.refresh_token) return back("error", "Google didn't return a long-term token. Please try Connect Google again.");
    const granted = (t.scope ?? "").split(" ");
    const missing = GOOGLE_SCOPES.filter((s) => s.startsWith("https://") && !granted.includes(s));
    if (missing.length) return back("error", "Please tick both the Gmail and Calendar boxes on Google's permission screen.");
    const email = emailFromIdToken(t.id_token) ?? "unknown";
    const { error } = await supabase.rpc("save_google_connection", {
      p_email: email, p_token_enc: encryptToken(t.refresh_token), p_scopes: t.scope ?? "",
    });
    if (error) return back("error", error.message);
    const r = (await syncGoogle(supabase, { force: true })).find((x) => x.email === email);
    const summary = r?.error
      ? `Connected ${email}, but the first pull failed: ${r.error}`
      : `Connected ${email}. Pulled ${r?.events ?? 0} calendar events and ${r?.suggestions ?? 0} new email suggestions.`;
    return back(r?.error ? "error" : "notice", summary);
  } catch (e) {
    return back("error", e instanceof Error ? e.message : "Google sign-in failed.");
  }
}
