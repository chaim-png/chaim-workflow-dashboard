import { randomBytes } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { authUrl, googleConfigured } from "@/lib/google";

export async function GET(req: NextRequest) {
  const origin = req.nextUrl.origin;
  if (!googleConfigured()) {
    return NextResponse.redirect(`${origin}/account?error=${encodeURIComponent("Google isn't set up yet: the Google client ID and secret still need to be added in Vercel.")}`);
  }
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) return NextResponse.redirect(`${origin}/login`);
  const state = randomBytes(24).toString("base64url");
  const res = NextResponse.redirect(authUrl(origin, state, data.claims.email as string | undefined));
  res.cookies.set("google_oauth_state", state, { httpOnly: true, secure: true, sameSite: "lax", path: "/api/google", maxAge: 600 });
  return res;
}
