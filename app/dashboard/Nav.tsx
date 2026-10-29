"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const groups: [string, [string, string][]][] = [
  ["", [["Overview", "/dashboard"]]],
  ["Outbound", [["Campaigns", "/dashboard/campaigns"], ["Wallet", "/dashboard/wallet"], ["Compliance", "/dashboard/compliance"]]],
  ["Inbound", [["Receptionist", "/dashboard/receptionist"], ["Knowledge", "/dashboard/knowledge"], ["Test call", "/dashboard/test-call"], ["Appointments", "/dashboard/appointments"]]],
  ["Results", [["Leads", "/dashboard/leads"], ["Calls", "/dashboard/calls"]]],
  ["Workspace", [["Phone & booking", "/dashboard/channels"], ["Team", "/dashboard/team"], ["Usage", "/dashboard/usage"], ["Billing", "/dashboard/billing"]]],
];

export default function Nav() {
  const path = usePathname();
  return (
    <nav className="nav" aria-label="Main">
      {groups.map(([title, items]) => (
        <div className="nav-group" key={title || "top"}>
          {title && <div className="nav-title">{title}</div>}
          {items.map(([label, href]) => {
            const on = href === "/dashboard" ? path === href : path === href || path.startsWith(href + "/");
            return <Link key={href} href={href} className={`navlink${on ? " on" : ""}`}>{label}</Link>;
          })}
        </div>
      ))}
    </nav>
  );
}
