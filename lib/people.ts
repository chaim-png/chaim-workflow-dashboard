import type { Member } from "@/lib/types";

export function memberName(members: Member[], email: string | null | undefined) {
  if (!email) return "Unassigned";
  return members.find((m) => m.email === email)?.full_name ?? email;
}

export function firstName(members: Member[], email: string | null | undefined) {
  return memberName(members, email).split(" ")[0];
}

export function nameForUser(members: Member[], userId: string | null | undefined) {
  if (!userId) return "System";
  return members.find((m) => m.user_id === userId)?.full_name ?? "Unknown user";
}
