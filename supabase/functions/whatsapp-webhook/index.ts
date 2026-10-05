// Receives WhatsApp events for Chaim's and Nadine's numbers (coexistence via Dualhook's Webhook
// Override: Meta posts straight here, unsigned for us). Security therefore rests on:
//   1. a secret path segment: .../functions/v1/whatsapp-webhook/<path_secret>
//   2. the number being listed in whatsapp_numbers, and its phone_number_id matching once known.
// Privacy: personal contacts are dropped, unsorted contacts keep no text (unless a hold window is
// set); the database enforces the same rule with a trigger.
//
// The secret path and verify token live in public.whatsapp_webhook_secret (service role only), so no
// function secrets need setting. SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are provided by
// Supabase. Deploy with verify_jwt = false (see supabase/config.toml).

import { createClient } from "jsr:@supabase/supabase-js@2";
import { parseWebhook, type ParsedContact, type ParsedMessage } from "./parse.ts";

const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

function safeEqual(a: string, b: string) {
  if (!a || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

type NumberRow = { display_phone: string; phone_number_id: string | null; waba_id: string | null };
type ContactRow = { id: string; display_phone: string; wa_id: string; status: "unsorted" | "client" | "personal" };

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const { data: keys } = await db.from("whatsapp_webhook_secret").select("path_secret, verify_token").maybeSingle();
  const secret = url.pathname.split("/").filter(Boolean).pop() ?? "";
  if (!keys || !safeEqual(secret, keys.path_secret)) return new Response("Not found", { status: 404 });

  if (req.method === "GET") {
    const ok = url.searchParams.get("hub.mode") === "subscribe" && safeEqual(url.searchParams.get("hub.verify_token") ?? "", keys.verify_token);
    return ok ? new Response(url.searchParams.get("hub.challenge") ?? "") : new Response("Forbidden", { status: 403 });
  }
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  let payload: unknown;
  try {
    payload = await req.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }

  const parsed = parseWebhook(payload);
  for (const n of parsed.notes) console.log(n);
  if (parsed.messages.length === 0 && parsed.contacts.length === 0) return new Response("ok");

  try {
    const allowed = await allowedNumbers(db, [...parsed.contacts, ...parsed.messages]);
    const contacts = parsed.contacts.filter((c) => allowed.has(c.displayPhone));
    const messages = parsed.messages.filter((m) => allowed.has(m.displayPhone));
    const dropped = parsed.messages.length - messages.length + parsed.contacts.length - contacts.length;
    if (dropped) console.log(`dropped ${dropped} records for numbers not on the list`);

    await saveContacts(db, contacts, messages);
    await saveMessages(db, messages);
    await db.rpc("whatsapp_purge_unsorted");
  } catch (e) {
    console.error(e);
    return new Response("Error", { status: 500 }); // Meta retries later
  }
  return new Response("ok");
});

// deno-lint-ignore no-explicit-any
type Db = any;

/** Numbers we accept. Fills in phone_number_id and waba_id the first time a listed number reports. */
async function allowedNumbers(db: Db, records: { displayPhone: string; phoneNumberId: string | null; wabaId: string | null }[]) {
  const { data, error } = await db.from("whatsapp_numbers").select("display_phone, phone_number_id, waba_id");
  if (error) throw error;
  const rows = new Map((data as NumberRow[]).map((r) => [r.display_phone, r]));
  const ok = new Set<string>();
  for (const r of records) {
    const row = rows.get(r.displayPhone);
    if (!row || !r.phoneNumberId) continue;
    if (row.phone_number_id && row.phone_number_id !== r.phoneNumberId) continue;
    if (row.waba_id && r.wabaId && row.waba_id !== r.wabaId) continue;
    if (!row.phone_number_id) {
      const { error: e } = await db.from("whatsapp_numbers")
        .update({ phone_number_id: r.phoneNumberId, waba_id: r.wabaId, connected_at: new Date().toISOString() })
        .eq("display_phone", r.displayPhone).is("phone_number_id", null);
      if (e) throw e;
      row.phone_number_id = r.phoneNumberId;
      row.waba_id = r.wabaId;
    }
    ok.add(r.displayPhone);
  }
  return ok;
}

async function saveContacts(db: Db, contacts: ParsedContact[], messages: ParsedMessage[]) {
  const named = new Map<string, { display_phone: string; wa_id: string; name: string }>();
  const unnamed = new Map<string, { display_phone: string; wa_id: string }>();
  for (const c of contacts) {
    const key = `${c.displayPhone}:${c.waId}`;
    if (c.name) named.set(key, { display_phone: c.displayPhone, wa_id: c.waId, name: c.name });
  }
  for (const m of messages) {
    const key = `${m.displayPhone}:${m.waId}`;
    if (!named.has(key)) unnamed.set(key, { display_phone: m.displayPhone, wa_id: m.waId });
  }
  if (named.size) {
    const { error } = await db.from("whatsapp_contacts").upsert([...named.values()], { onConflict: "display_phone,wa_id" });
    if (error) throw error;
  }
  if (unnamed.size) {
    const { error } = await db.from("whatsapp_contacts").upsert([...unnamed.values()], { onConflict: "display_phone,wa_id", ignoreDuplicates: true });
    if (error) throw error;
  }
}

async function saveMessages(db: Db, messages: ParsedMessage[]) {
  if (!messages.length) return;
  const { data: settings } = await db.from("whatsapp_settings").select("unsorted_hold_hours").single();
  const hold = (settings?.unsorted_hold_hours ?? 0) > 0;

  const byPhone = new Map<string, Set<string>>();
  for (const m of messages) (byPhone.get(m.displayPhone) ?? byPhone.set(m.displayPhone, new Set()).get(m.displayPhone)!).add(m.waId);
  const contacts = new Map<string, ContactRow>();
  for (const [phone, ids] of byPhone) {
    const list = [...ids];
    for (let i = 0; i < list.length; i += 200) {
      const { data, error } = await db.from("whatsapp_contacts").select("id, display_phone, wa_id, status")
        .eq("display_phone", phone).in("wa_id", list.slice(i, i + 200));
      if (error) throw error;
      for (const c of data as ContactRow[]) contacts.set(`${c.display_phone}:${c.wa_id}`, c);
    }
  }

  const rows = [];
  for (const m of messages) {
    const c = contacts.get(`${m.displayPhone}:${m.waId}`);
    if (!c || c.status === "personal") continue;
    rows.push({
      id: m.id,
      contact_id: c.id,
      direction: m.direction,
      sent_at: m.sentAt,
      type: m.type,
      body: c.status === "client" || hold ? m.body : null,
      from_history: m.fromHistory,
    });
  }
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("whatsapp_messages").upsert(rows.slice(i, i + 500), { onConflict: "id", ignoreDuplicates: true });
    if (error) throw error;
  }
}
