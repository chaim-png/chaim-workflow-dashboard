"use client";

import { updateFollowUp, updateTask } from "@/app/actions";
import type { Member } from "@/lib/types";

/** Who an item is assigned to, changeable straight from a list: picking a name saves it. */
export function AssignSelect({ kind, id, assignee, members, color, back }: {
  kind: "task" | "follow_up"; id: string; assignee: string | null; members: Member[]; color: string; back?: string;
}) {
  return (
    <form action={kind === "task" ? updateTask : updateFollowUp} className="inline-flex items-center gap-1.5">
      <input type="hidden" name="id" value={id} />
      {back && <input type="hidden" name="redirect_to" value={back} />}
      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: color }} aria-hidden />
      <select
        name="assignee"
        defaultValue={assignee ?? ""}
        aria-label="Assigned to"
        onChange={(e) => e.currentTarget.form?.requestSubmit()}
        className="cursor-pointer rounded-md border border-transparent bg-transparent py-0.5 pr-1 text-sm hover:border-[var(--line)] focus:border-[var(--accent)] focus:outline-none"
      >
        <option value="">Unassigned</option>
        {members.map((m) => <option key={m.email} value={m.email}>{m.full_name.split(" ")[0]}</option>)}
      </select>
    </form>
  );
}
