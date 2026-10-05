export type Member = { email: string; full_name: string; role: string; user_id: string | null };

export type TaskStatus = "todo" | "in_progress" | "waiting" | "done";
export type Source = "manual" | "email" | "calendar" | "granola" | "plaud" | "whatsapp" | "kb";

export type Client = { id: string; name: string; kind: string | null; notes: string | null };

export type Task = {
  id: string;
  title: string;
  details: string | null;
  client_id: string | null;
  assignee: string | null;
  status: TaskStatus;
  priority: "low" | "normal" | "high";
  due_date: string | null;
  waiting_on: string | null;
  source: Source;
  source_ref: string | null;
  source_url: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  deleted_at: string | null;
  clients?: { id: string; name: string } | null;
};

export type FollowUp = {
  id: string;
  matter: string;
  client_id: string | null;
  contact_name: string | null;
  contact_email: string | null;
  direction: "they_wait_on_us" | "we_wait_on_them";
  asked_on: string | null;
  what: string | null;
  draft: string | null;
  assignee: string | null;
  status: "open" | "done" | "snoozed";
  next_action_on: string | null;
  task_id: string | null;
  source: Source;
  source_url: string | null;
  clients?: { id: string; name: string } | null;
};

export type Suggestion = {
  id: string;
  kind: "task" | "follow_up";
  title: string;
  details: string | null;
  client_name: string | null;
  contact_name: string | null;
  contact_email: string | null;
  suggested_assignee: string | null;
  suggested_due: string | null;
  draft: string | null;
  source: Source;
  source_ref: string | null;
  source_url: string | null;
  source_date: string | null;
  status: "pending" | "accepted" | "dismissed";
  decided_by: string | null;
  decided_at: string | null;
  result_id: string | null;
  created_at: string;
};

export type AuditEntry = {
  id: number;
  table_name: string;
  row_id: string;
  action: string;
  actor_label: string;
  changed_at: string;
  changed_fields: string[] | null;
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
};

export type CalendarEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string | null;
  all_day: boolean;
  location: string | null;
  attendees: string | null;
  url: string | null;
};

export type Meeting = {
  id: string;
  source: "granola" | "plaud";
  title: string;
  occurred_at: string | null;
  summary: string | null;
  action_items: { text: string; owner?: string; due?: string }[];
  url: string | null;
};

export type WhatsAppContact = {
  id: string;
  display_phone: string;
  wa_id: string;
  name: string | null;
  status: "unsorted" | "client" | "personal";
  client_id: string | null;
  message_count: number;
  last_message_at: string | null;
  clients?: { id: string; name: string } | null;
};

export type WhatsAppMessage = {
  id: string;
  contact_id: string;
  direction: "in" | "out";
  sent_at: string;
  type: string;
  body: string | null;
};
