import { requireBusiness } from "@/lib/tenant/context";
import { addMember, removeMember } from "../more-actions";

type M = { user_id: string; email: string; role: string };

export default async function Team() {
  const { supabase, active, user } = await requireBusiness();
  const { data } = await supabase.rpc("list_members", { p_business: active.id });
  const members = (data ?? []) as M[];
  const canAdd = active.role !== "member";
  return (
    <>
      <h1>Team</h1>
      <p className="sub">People who can access {active.name}. Members can view and handle calls, leads and appointments. Admins can also edit settings and knowledge.</p>
      <div className="card">
        {members.map((m) => (
          <div className="row" key={m.user_id}>
            <span>{m.email}{m.user_id === user.id ? " (you)" : ""}</span><span className="tag ok">{m.role}</span>
            {active.role === "owner" && m.role !== "owner" && (
              <form action={removeMember}><input type="hidden" name="user" value={m.user_id} /><button className="btn" type="submit">Remove</button></form>)}
          </div>
        ))}
      </div>
      {canAdd && (
        <form className="card" action={addMember}>
          <b>Add a person</b>
          <p className="mut">They must already have a Vaachak account. Only the owner can add admins.</p>
          <label htmlFor="email">Email</label><input id="email" name="email" type="email" required />
          <label htmlFor="role">Role</label>
          <select id="role" name="role"><option value="member">Member</option><option value="admin">Admin</option></select>
          <div className="actions"><button className="btn primary" type="submit">Add</button></div>
        </form>
      )}
    </>
  );
}
