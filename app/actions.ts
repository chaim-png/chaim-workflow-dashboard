"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function str(fd: FormData, key: string): string | null {
  const v = fd.get(key);
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t === "" ? null : t;
}

async function db() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims) redirect("/login");
  return { supabase, userId: data.claims.sub as string };
}

function done(path?: string | null) {
  revalidatePath("/", "layout");
  if (path) redirect(path);
}

async function clientIdFor(supabase: Awaited<ReturnType<typeof createClient>>, name: string | null) {
  if (!name) return null;
  const { data: existing } = await supabase.from("clients").select("id").ilike("name", name).maybeSingle();
  if (existing) return existing.id as string;
  const { data, error } = await supabase.from("clients").insert({ name }).select("id").single();
  if (error) throw new Error(error.message);
  return data.id as string;
}

// ---------- Tasks ----------

export async function createTask(fd: FormData) {
  const { supabase } = await db();
  const client_id = str(fd, "client_id") ?? (await clientIdFor(supabase, str(fd, "new_client")));
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: str(fd, "title"),
      details: str(fd, "details"),
      assignee: str(fd, "assignee"),
      due_date: str(fd, "due_date"),
      due_time: str(fd, "due_time"),
      priority: str(fd, "priority") ?? "medium",
      client_id,
      source: "manual",
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  done(str(fd, "redirect_to") ?? `/tasks/${data.id}`);
}

export async function updateTask(fd: FormData) {
  const { supabase } = await db();
  const id = str(fd, "id")!;
  const patch: Record<string, unknown> = {};
  for (const k of ["title", "details", "assignee", "status", "priority", "due_date", "due_time", "waiting_on", "client_id"]) {
    if (fd.has(k)) patch[k] = str(fd, k);
  }
  if (patch.status === null) delete patch.status;
  if (patch.priority === null) delete patch.priority;
  if (patch.title === null) delete patch.title;
  const { error } = await supabase.from("tasks").update(patch).eq("id", id);
  if (error) throw new Error(error.message);
  done(str(fd, "redirect_to"));
}

export async function deleteTask(fd: FormData) {
  const { supabase } = await db();
  const id = str(fd, "id")!;
  const { error } = await supabase.from("tasks").update({ deleted_at: new Date().toISOString() }).eq("id", id);
  if (error) throw new Error(error.message);
  done("/tasks");
}

export async function restoreTask(fd: FormData) {
  const { supabase } = await db();
  const id = str(fd, "id")!;
  const { error } = await supabase.from("tasks").update({ deleted_at: null }).eq("id", id);
  if (error) throw new Error(error.message);
  done(`/tasks/${id}`);
}

export async function addComment(fd: FormData) {
  const { supabase, userId } = await db();
  const task_id = str(fd, "task_id")!;
  const body = str(fd, "body");
  if (!body) return;
  const { error } = await supabase.from("task_comments").insert({ task_id, body, author: userId });
  if (error) throw new Error(error.message);
  done();
}

export async function deleteComment(fd: FormData) {
  const { supabase } = await db();
  const { error } = await supabase
    .from("task_comments")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", str(fd, "id")!);
  if (error) throw new Error(error.message);
  done();
}

// ---------- Follow-ups ----------

export async function createFollowUp(fd: FormData) {
  const { supabase } = await db();
  const client_id = str(fd, "client_id") ?? (await clientIdFor(supabase, str(fd, "new_client")));
  const { error } = await supabase.from("follow_ups").insert({
    matter: str(fd, "matter"),
    contact_name: str(fd, "contact_name"),
    contact_email: str(fd, "contact_email"),
    direction: str(fd, "direction") ?? "they_wait_on_us",
    asked_on: str(fd, "asked_on"),
    what: str(fd, "what"),
    draft: str(fd, "draft"),
    assignee: str(fd, "assignee"),
    next_action_on: str(fd, "next_action_on"),
    next_action_time: str(fd, "next_action_time"),
    urgency: str(fd, "urgency") ?? "medium",
    client_id,
    source: "manual",
  });
  if (error) throw new Error(error.message);
  done("/follow-ups");
}

export async function updateFollowUp(fd: FormData) {
  const { supabase } = await db();
  const patch: Record<string, unknown> = {};
  for (const k of ["status", "assignee", "next_action_on", "next_action_time", "urgency", "draft", "what", "matter",
    "contact_name", "contact_email", "direction", "asked_on", "client_id"]) {
    if (fd.has(k)) patch[k] = str(fd, k);
  }
  for (const k of ["status", "urgency", "matter", "direction"]) if (patch[k] === null) delete patch[k];
  const { error } = await supabase.from("follow_ups").update(patch).eq("id", str(fd, "id")!);
  if (error) throw new Error(error.message);
  done(str(fd, "redirect_to"));
}

export async function followUpToTask(fd: FormData) {
  const { supabase } = await db();
  const id = str(fd, "id")!;
  const { data: f, error: e1 } = await supabase.from("follow_ups").select("*").eq("id", id).single();
  if (e1) throw new Error(e1.message);
  const { data: t, error } = await supabase
    .from("tasks")
    .insert({
      title: `Follow up: ${f.matter}${f.contact_name ? ` (${f.contact_name})` : ""}`,
      details: [f.what, f.draft ? `Draft:\n${f.draft}` : null].filter(Boolean).join("\n\n"),
      client_id: f.client_id,
      assignee: f.assignee,
      due_date: f.next_action_on,
      due_time: f.next_action_time,
      priority: f.urgency,
      status: f.direction === "we_wait_on_them" ? "waiting" : "todo",
      waiting_on: f.direction === "we_wait_on_them" ? f.contact_name : null,
      source: f.source,
      source_ref: f.source_ref,
      source_url: f.source_url,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  await supabase.from("follow_ups").update({ task_id: t.id }).eq("id", id);
  done(`/tasks/${t.id}`);
}

// ---------- Suggestions ----------

/** Edits a suggestion box makes before accepting (title, details, draft, type, time, urgency). */
function suggestionEdits(fd: FormData) {
  const patch: Record<string, unknown> = {};
  const map: Record<string, string> = {
    title: "title", details: "details", draft: "draft", kind: "kind", client_name: "client_name",
    contact_name: "contact_name", contact_email: "contact_email", assignee: "suggested_assignee",
    due_date: "suggested_due", due_time: "suggested_time", urgency: "urgency",
  };
  for (const [field, col] of Object.entries(map)) if (fd.has(field)) patch[col] = str(fd, field);
  for (const k of ["title", "kind", "urgency"]) if (patch[k] === null) delete patch[k];
  return patch;
}

export async function updateSuggestion(fd: FormData) {
  const { supabase } = await db();
  const { error } = await supabase.from("suggestions").update(suggestionEdits(fd)).eq("id", str(fd, "id")!).eq("status", "pending");
  if (error) throw new Error(error.message);
  done();
}

export async function acceptSuggestion(fd: FormData) {
  const { supabase, userId } = await db();
  const id = str(fd, "id")!;
  const { data: orig, error: e1 } = await supabase.from("suggestions").select("*").eq("id", id).single();
  if (e1) throw new Error(e1.message);
  if (orig.status !== "pending") return done();
  const edits = suggestionEdits(fd);
  if (Object.keys(edits).length) {
    const { error } = await supabase.from("suggestions").update(edits).eq("id", id);
    if (error) throw new Error(error.message);
  }
  const s = { ...orig, ...edits };
  const client_id = await clientIdFor(supabase, s.client_name);
  let result_id: string;
  if (s.kind === "task") {
    const details = [s.details, s.draft ? `Draft:\n${s.draft}` : null].filter(Boolean).join("\n\n") || null;
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title: s.title, details, client_id, assignee: s.suggested_assignee, due_date: s.suggested_due,
        due_time: s.suggested_time, priority: s.urgency ?? "medium",
        source: s.source, source_ref: s.source_ref, source_url: s.source_url,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    result_id = data.id;
  } else {
    const { data, error } = await supabase
      .from("follow_ups")
      .insert({
        matter: s.title, client_id, contact_name: s.contact_name, contact_email: s.contact_email,
        direction: "they_wait_on_us", asked_on: s.source_date?.slice(0, 10) ?? null,
        what: s.details, draft: s.draft, assignee: s.suggested_assignee, next_action_on: s.suggested_due,
        next_action_time: s.suggested_time, urgency: s.urgency ?? "medium",
        source: s.source, source_ref: s.source_ref, source_url: s.source_url,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    result_id = data.id;
  }
  const { error } = await supabase
    .from("suggestions")
    .update({ status: "accepted", decided_by: userId, decided_at: new Date().toISOString(), result_id })
    .eq("id", id);
  if (error) throw new Error(error.message);
  done();
}

export async function dismissSuggestion(fd: FormData) {
  const { supabase, userId } = await db();
  const { error } = await supabase
    .from("suggestions")
    .update({ status: "dismissed", decided_by: userId, decided_at: new Date().toISOString() })
    .eq("id", str(fd, "id")!);
  if (error) throw new Error(error.message);
  done();
}

export async function reopenSuggestion(fd: FormData) {
  const { supabase } = await db();
  const { error } = await supabase
    .from("suggestions")
    .update({ status: "pending", decided_by: null, decided_at: null })
    .eq("id", str(fd, "id")!)
    .eq("status", "dismissed");
  if (error) throw new Error(error.message);
  done();
}

// ---------- Calendar and meeting action items ----------

/** Turns a calendar event into a task (mode "track"), or a task already marked done (mode "done"). */
export async function trackCalendarEvent(fd: FormData) {
  const { supabase } = await db();
  const id = str(fd, "id")!;
  const { data: existing } = await supabase.from("tasks").select("id").eq("source", "calendar").eq("source_ref", id).is("deleted_at", null).maybeSingle();
  if (existing) {
    if (str(fd, "mode") === "done") await supabase.from("tasks").update({ status: "done" }).eq("id", existing.id);
    return done(str(fd, "mode") === "track" ? `/tasks/${existing.id}` : str(fd, "redirect_to"));
  }
  const { data: e, error: e1 } = await supabase.from("calendar_events").select("*").eq("id", id).single();
  if (e1) throw new Error(e1.message);
  const day = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Johannesburg" }).format(new Date(e.starts_at));
  const time = e.all_day ? null : new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Johannesburg", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(e.starts_at));
  const mode = str(fd, "mode");
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      title: String(e.title).trim(),
      details: [e.location ? `Where: ${e.location}` : null, e.attendees ? `With: ${e.attendees}` : null].filter(Boolean).join("\n") || null,
      assignee: str(fd, "assignee"), due_date: day, due_time: time,
      status: mode === "done" ? "done" : "todo",
      completed_at: mode === "done" ? new Date().toISOString() : null,
      source: "calendar", source_ref: id, source_url: e.url,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  done(mode === "track" ? `/tasks/${data.id}` : str(fd, "redirect_to"));
}

/** Turns one action item from a Granola or Plaud meeting into an assigned task. */
export async function actionItemToTask(fd: FormData) {
  const { supabase } = await db();
  const meetingId = str(fd, "meeting_id")!;
  const index = Number(str(fd, "index"));
  const { data: m, error: e1 } = await supabase.from("meetings").select("*").eq("id", meetingId).single();
  if (e1) throw new Error(e1.message);
  const item = (m.action_items as { text: string; owner?: string; due?: string }[])[index];
  if (!item) return done();
  const { error } = await supabase.from("tasks").insert({
    title: str(fd, "title") ?? item.text,
    details: `From ${m.source === "granola" ? "Granola" : "Plaud"} meeting "${m.title}"${item.owner ? `\nOwner in notes: ${item.owner}` : ""}`,
    assignee: str(fd, "assignee"), due_date: str(fd, "due_date") ?? (/^\d{4}-\d{2}-\d{2}$/.test(item.due ?? "") ? item.due : null),
    due_time: str(fd, "due_time"), priority: str(fd, "priority") ?? "medium",
    source: m.source, source_ref: `${m.id}:${index}`, source_url: m.url,
  });
  if (error && !/duplicate key/.test(error.message)) throw new Error(error.message);
  done();
}

// ---------- Clients ----------

export async function createClientRecord(fd: FormData) {
  const { supabase } = await db();
  const { data, error } = await supabase
    .from("clients")
    .insert({ name: str(fd, "name"), kind: str(fd, "kind"), notes: str(fd, "notes") })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  done(`/clients/${data.id}`);
}

export async function updateClientRecord(fd: FormData) {
  const { supabase } = await db();
  const id = str(fd, "id")!;
  const { error } = await supabase
    .from("clients")
    .update({ name: str(fd, "name"), kind: str(fd, "kind"), notes: str(fd, "notes") })
    .eq("id", id);
  if (error) throw new Error(error.message);
  done(`/clients/${id}`);
}

// ---------- Auth ----------

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
