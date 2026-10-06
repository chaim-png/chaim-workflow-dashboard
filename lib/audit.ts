import type { AuditEntry, Member } from "@/lib/types";
import { memberName } from "@/lib/people";

const TABLE_NOUN: Record<string, string> = {
  tasks: "task", task_comments: "comment", follow_ups: "follow-up", suggestions: "suggestion", clients: "client",
};

const FIELD_LABEL: Record<string, string> = {
  title: "title", details: "details", assignee: "assignee", status: "status", priority: "urgency", urgency: "urgency", due_time: "due time", next_action_time: "chase time", suggested_time: "time", suggested_due: "due date", suggested_assignee: "assignee",
  due_date: "due date", waiting_on: "waiting on", client_id: "client", body: "text", matter: "matter",
  next_action_on: "next action date", draft: "draft", what: "description", name: "name", notes: "notes", kind: "type",
};

const URGENCY_NAME: Record<string, string> = { low: "Low", medium: "Medium", urgent: "Urgent", normal: "Medium", high: "Urgent" };

const HIDDEN = new Set(["completed_at", "decided_by", "decided_at", "result_id", "task_id", "deleted_at"]);

function label(row: Record<string, unknown> | null) {
  if (!row) return "";
  const v = row.title ?? row.matter ?? row.name ?? (typeof row.body === "string" ? row.body.slice(0, 60) : null);
  return v ? `"${v}"` : "";
}

export function fmtValue(field: string, v: unknown, members: Member[], clientNames?: Record<string, string>): string {
  if (v === null || v === undefined || v === "") return "empty";
  if (field === "client_id") return clientNames?.[String(v)] ?? "a client";
  if (field === "assignee") return memberName(members, String(v));
  if (field === "priority" || field === "urgency") return URGENCY_NAME[String(v)] ?? String(v);
  if (/_time$/.test(field)) return String(v).slice(0, 5);
  if (field === "status") return ({ todo: "To do", in_progress: "In progress", waiting: "Waiting", done: "Done" } as Record<string, string>)[String(v)] ?? String(v);
  return String(v).length > 80 ? String(v).slice(0, 80) + "…" : String(v);
}

export function describeChange(a: AuditEntry, members: Member[]): string {
  const noun = TABLE_NOUN[a.table_name] ?? a.table_name;
  const row = a.new_data ?? a.old_data;
  if (a.action === "insert") return `created ${noun} ${label(row)}`;
  if (a.action === "delete") return `deleted ${noun} ${label(row)}`;
  if (a.action === "restore") return `restored ${noun} ${label(row)}`;
  if (a.table_name === "suggestions" && a.changed_fields?.includes("status")) {
    return `${a.new_data?.status === "accepted" ? "accepted" : a.new_data?.status === "dismissed" ? "dismissed" : "reopened"} suggestion ${label(row)}`;
  }
  const fields = (a.changed_fields ?? []).filter((f) => !HIDDEN.has(f));
  const parts = fields.slice(0, 3).map((f) =>
    f === "details" || f === "draft" || f === "notes"
      ? `changed ${FIELD_LABEL[f] ?? f}`
      : `${FIELD_LABEL[f] ?? f} → ${fmtValue(f, a.new_data?.[f], members)}`,
  );
  return `updated ${noun} ${label(row)}${parts.length ? ": " + parts.join(", ") : ""}`;
}
