// Turns a Meta WhatsApp webhook payload into flat contact and message records.
// Pure: no Deno or Supabase APIs, so it can be tested with plain Node.
// Handles the coexistence fields: messages (incoming), smb_message_echoes (sent from the phone),
// history (one-off import of past chats) and smb_app_state_sync (the phone's contact list).

export type ParsedMessage = {
  id: string;
  displayPhone: string;
  phoneNumberId: string | null;
  wabaId: string | null;
  waId: string;
  direction: "in" | "out";
  sentAt: string;
  type: string;
  body: string | null;
  fromHistory: boolean;
};

export type ParsedContact = {
  displayPhone: string;
  phoneNumberId: string | null;
  wabaId: string | null;
  waId: string;
  name: string | null;
};

export type Parsed = { messages: ParsedMessage[]; contacts: ParsedContact[]; notes: string[] };

// deno-lint-ignore no-explicit-any
type Any = any;

const digits = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).replace(/\D/g, "") : "");

function toIso(ts: unknown): string {
  const n = Number(ts);
  return Number.isFinite(n) && n > 0 ? new Date(n * 1000).toISOString() : new Date().toISOString();
}

/** Readable text for a message, or a short marker for media and other types. Media is never downloaded. */
export function messageBody(m: Any): string | null {
  const t = m?.type;
  if (t === "text") return m.text?.body ?? null;
  if (t === "image" || t === "video" || t === "document" || t === "sticker" || t === "audio") {
    const media = m[t] ?? {};
    const label = t === "audio" ? (media.voice ? "voice note" : "audio") : t;
    const extra = [media.filename, media.caption].filter(Boolean).join(": ");
    return extra ? `[${label}] ${extra}` : `[${label}]`;
  }
  if (t === "location") {
    const l = m.location ?? {};
    return `[location] ${[l.name, l.address].filter(Boolean).join(", ") || `${l.latitude},${l.longitude}`}`;
  }
  if (t === "contacts") return `[contact card] ${(m.contacts ?? []).map((c: Any) => c?.name?.formatted_name).filter(Boolean).join(", ")}`;
  if (t === "reaction") return null;
  if (t === "button") return m.button?.text ?? null;
  if (t === "interactive") return m.interactive?.button_reply?.title ?? m.interactive?.list_reply?.title ?? null;
  return t ? `[${t}]` : null;
}

export function parseWebhook(payload: Any): Parsed {
  const out: Parsed = { messages: [], contacts: [], notes: [] };
  if (payload?.object !== "whatsapp_business_account") {
    out.notes.push("ignored: not a whatsapp_business_account payload");
    return out;
  }
  for (const entry of payload.entry ?? []) {
    const wabaId = entry?.id ? String(entry.id) : null;
    for (const change of entry?.changes ?? []) {
      const field = change?.field;
      const v = change?.value ?? {};
      const displayPhone = digits(v.metadata?.display_phone_number);
      const phoneNumberId = v.metadata?.phone_number_id ? String(v.metadata.phone_number_id) : null;
      if (!displayPhone) {
        out.notes.push(`ignored ${field}: no display phone`);
        continue;
      }
      const base = { displayPhone, phoneNumberId, wabaId };
      const push = (m: Any, waId: string, direction: "in" | "out", fromHistory: boolean) => {
        if (!m?.id || !waId || m.type === "reaction" || m.group_id) return;
        out.messages.push({ ...base, id: String(m.id), waId, direction, sentAt: toIso(m.timestamp), type: String(m.type ?? "unknown"), body: messageBody(m), fromHistory });
      };

      if (field === "messages") {
        for (const c of v.contacts ?? []) {
          const waId = digits(c?.wa_id);
          if (waId) out.contacts.push({ ...base, waId, name: c?.profile?.name ?? null });
        }
        for (const m of v.messages ?? []) push(m, digits(m?.from), "in", false);
      } else if (field === "smb_message_echoes") {
        for (const m of v.message_echoes ?? []) push(m, digits(m?.to), "out", false);
      } else if (field === "history") {
        for (const chunk of v.history ?? []) {
          for (const e of chunk?.errors ?? []) out.notes.push(`history error ${e?.code}: ${e?.title}`);
          for (const thread of chunk?.threads ?? []) {
            const waId = digits(thread?.id);
            for (const m of thread?.messages ?? []) {
              const from = digits(m?.from);
              push(m, waId, from && from === displayPhone ? "out" : "in", true);
            }
          }
        }
      } else if (field === "smb_app_state_sync") {
        for (const s of v.state_sync ?? []) {
          if (s?.type !== "contact" || s?.action === "remove") continue;
          const waId = digits(s.contact?.phone_number);
          if (waId) out.contacts.push({ ...base, waId, name: s.contact?.full_name ?? s.contact?.first_name ?? null });
        }
      } else {
        out.notes.push(`ignored field ${field}`);
      }
    }
  }
  return out;
}
