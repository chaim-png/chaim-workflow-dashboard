// Run: deno test supabase/functions/whatsapp-webhook
import { parseWebhook } from "./parse.ts";
import assert from "node:assert/strict";

Deno.test("parses coexistence webhook fields", () => {
const wrap = (field: string, value: Record<string, unknown>) => ({ object: "whatsapp_business_account", entry: [{ id: "WABA1", changes: [{ field, value: { messaging_product: "whatsapp", metadata: { display_phone_number: "27 65 174 5729", phone_number_id: "PN1" }, ...value } }] }] });
let r = parseWebhook(wrap("messages", { contacts: [{ wa_id: "27821111111", profile: { name: "Client A" } }], messages: [{ from: "27821111111", id: "w1", timestamp: "1739321024", type: "text", text: { body: "Hi" } }, { from: "27821111111", id: "w2", timestamp: "1739321025", type: "image", image: { caption: "plan" } }, { from: "27821111111", id: "w3", type: "reaction", reaction: {} }], statuses: [] }));
assert.equal(r.messages.length, 2); assert.equal(r.messages[0].displayPhone, "27651745729"); assert.equal(r.messages[0].direction, "in"); assert.equal(r.messages[1].body, "[image] plan"); assert.equal(r.contacts[0].name, "Client A"); assert.equal(r.messages[0].sentAt, "2025-02-12T00:43:44.000Z");
r = parseWebhook(wrap("smb_message_echoes", { message_echoes: [{ from: "27651745729", to: "16505551234", id: "w4", timestamp: "1739321024", type: "text", text: { body: "Here" } }] }));
assert.equal(r.messages[0].direction, "out"); assert.equal(r.messages[0].waId, "16505551234");
r = parseWebhook(wrap("history", { history: [{ metadata: { phase: 0 }, threads: [{ id: "27821111111", messages: [{ from: "27821111111", id: "h1", timestamp: "1739230955", type: "text", text: { body: "old" }, history_context: { status: "READ" } }, { from: "27651745729", id: "h2", timestamp: "1739230956", type: "text", text: { body: "reply" } }] }] }] }));
assert.deepEqual(r.messages.map(m => [m.direction, m.fromHistory, m.waId]), [["in", true, "27821111111"], ["out", true, "27821111111"]]);
r = parseWebhook(wrap("history", { history: [{ errors: [{ code: 2593109, title: "off" }] }] }));
assert.equal(r.messages.length, 0); assert.match(r.notes[0], /2593109/);
r = parseWebhook(wrap("smb_app_state_sync", { state_sync: [{ type: "contact", contact: { full_name: "Pablo", phone_number: "+1 650 555 1234" }, action: "add" }, { type: "contact", contact: { phone_number: "1" }, action: "remove" }] }));
assert.deepEqual(r.contacts.map(c => [c.waId, c.name]), [["16505551234", "Pablo"]]);
assert.equal(parseWebhook({ object: "page" }).messages.length, 0);
});
