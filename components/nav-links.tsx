"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Summary" },
  { href: "/tasks", label: "Tasks" },
  { href: "/suggestions", label: "Suggestions" },
  { href: "/follow-ups", label: "Follow-ups" },
  { href: "/whatsapp", label: "WhatsApp" },
  { href: "/clients", label: "Clients" },
  { href: "/calendar", label: "Calendar" },
  { href: "/history", label: "History" },
];

export function NavLinks({ pending }: { pending: number }) {
  const path = usePathname();
  return (
    <nav className="order-last flex w-full gap-1 overflow-x-auto text-sm sm:order-none sm:w-auto">
      {LINKS.map((l) => {
        const active = l.href === "/" ? path === "/" : path.startsWith(l.href);
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 ${active ? "bg-[var(--accent-bg)] text-[var(--accent)] font-medium" : "text-[var(--muted)] hover:text-[var(--text)]"}`}
          >
            {l.label}
            {l.href === "/suggestions" && pending > 0 && (
              <span className="ml-1 rounded-full bg-[var(--accent)] px-1.5 text-xs text-white">{pending}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
