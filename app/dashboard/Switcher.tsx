"use client";
import { switchBusiness } from "./actions";

export default function Switcher({ businesses, activeId }: { businesses: { id: string; name: string }[]; activeId?: string }) {
  return (
    <form action={switchBusiness}>
      <select name="id" defaultValue={activeId} aria-label="Business" onChange={(e) => e.currentTarget.form?.requestSubmit()}>
        {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
      </select>
    </form>
  );
}
