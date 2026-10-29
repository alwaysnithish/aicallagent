import Link from "next/link";
import { getContext } from "@/lib/tenant/context";
import { signOut } from "@/app/login/actions";
import Nav from "./Nav";
import Switcher from "./Switcher";

export const dynamic = "force-dynamic";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { businesses, active, user } = await getContext();
  return (
    <div className="shell">
      <aside className="side">
        <Link className="logo" href="/dashboard">vaach<i>ak</i></Link>
        {active && <Nav />}
      </aside>
      <div className="content">
        <header className="topbar plain">
          <div className="bar">
            {businesses.length > 0 && <Switcher businesses={businesses} activeId={active?.id} />}
            <Link className="btn" href="/dashboard/new">New business</Link>
          </div>
          <div className="bar">
            <span className="mut hide-sm">{user.email}</span>
            <form action={signOut}><button className="btn" type="submit">Sign out</button></form>
          </div>
        </header>
        <main className="wrap">{children}</main>
      </div>
    </div>
  );
}
