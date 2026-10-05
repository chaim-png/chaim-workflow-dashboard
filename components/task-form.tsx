import type { Client, Member } from "@/lib/types";
import { btnCls, inputCls, MemberSelect } from "@/components/ui";
import { createTask } from "@/app/actions";

export function NewTaskForm({ members, clients, me, clientId, redirectTo }: {
  members: Member[]; clients: Client[]; me: string; clientId?: string; redirectTo?: string;
}) {
  return (
    <form action={createTask} className="grid gap-2 sm:grid-cols-6">
      <input name="title" required placeholder="What needs doing?" className={`${inputCls} sm:col-span-6`} />
      <textarea name="details" placeholder="Details (optional)" rows={2} className={`${inputCls} sm:col-span-6`} />
      <MemberSelect members={members} defaultValue={me} className={`${inputCls} sm:col-span-2`} />
      <input name="due_date" type="date" className={`${inputCls} sm:col-span-1`} />
      <select name="priority" defaultValue="normal" className={`${inputCls} sm:col-span-1`}>
        <option value="low">Low</option><option value="normal">Normal</option><option value="high">High</option>
      </select>
      {clientId ? <input type="hidden" name="client_id" value={clientId} /> : (
        <>
          <select name="client_id" defaultValue="" className={`${inputCls} sm:col-span-2`}>
            <option value="">No client / matter</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <input name="new_client" placeholder="…or type a new client / matter" className={`${inputCls} sm:col-span-4`} />
        </>
      )}
      {redirectTo && <input type="hidden" name="redirect_to" value={redirectTo} />}
      <div className="sm:col-span-6"><button className={btnCls}>Create task</button></div>
    </form>
  );
}
