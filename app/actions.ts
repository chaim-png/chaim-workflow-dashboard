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
      priority: str(fd, "priority") ?? "normal",
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
  for (const k of ["title", "details", "assignee", "status", "priority", "due_date", "waiting_on", "client_id"]) {
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
    client_id,
    source: "manual",
  });
  if (error) throw new Error(error.message);
  done("/follow-ups");
}

export async function updateFollowUp(fd: FormData) {
  const { supabase } = await db();
  const patch: Record<string, unknown> = {};
  for (const k of ["status", "assignee", "next_action_on", "draft", "what"]) {
    if (fd.has(k)) patch[k] = str(fd, k);
  }
  if (patch.status === null) delete patch.status;
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

export async function acceptSuggestion(fd: FormData) {
  const { supabase, userId } = await db();
  const id = str(fd, "id")!;
  const { data: s, error: e1 } = await supabase.from("suggestions").select("*").eq("id", id).single();
  if (e1) throw new Error(e1.message);
  if (s.status !== "pending") return done();
  const assignee = str(fd, "assignee") ?? s.suggested_assignee;
  const due = str(fd, "due_date") ?? s.suggested_due;
  const title = str(fd, "title") ?? s.title;
  const client_id = await clientIdFor(supabase, s.client_name);
  let result_id: string;
  if (s.kind === "task") {
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        title, details: s.details, client_id, assignee, due_date: due,
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
        matter: title, client_id, contact_name: s.contact_name, contact_email: s.contact_email,
        direction: "they_wait_on_us", asked_on: s.source_date?.slice(0, 10) ?? null,
        what: s.details, draft: s.draft, assignee, next_action_on: due,
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
