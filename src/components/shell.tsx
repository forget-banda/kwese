"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { signOutAction } from "@/server/actions";
import { cn } from "@/lib/utils";
import type { Role } from "@/lib/types";

type Item = { href: string; label: string; roles: Role[] };

const groups: { label: string; items: Item[] }[] = [
  {
    label: "Desk",
    items: [{ href: "/", label: "Home", roles: ["admin", "bursar", "general"] }],
  },
  {
    label: "Pupils",
    items: [
      { href: "/students", label: "Register", roles: ["admin", "bursar", "general"] },
      { href: "/students/new", label: "Add a pupil", roles: ["admin", "bursar"] },
      { href: "/students/import", label: "Import sheets", roles: ["admin", "bursar"] },
      { href: "/students/class-list", label: "Class list", roles: ["admin", "bursar", "general"] },
      { href: "/students/promote", label: "End-of-year promotion", roles: ["admin", "bursar"] },
      { href: "/students/records", label: "Old records", roles: ["admin"] },
    ],
  },
  {
    label: "Money",
    items: [
      { href: "/invoices", label: "Invoices", roles: ["admin", "bursar"] },
      { href: "/invoices/generate", label: "Generate invoices", roles: ["admin", "bursar"] },
      { href: "/payments/take", label: "Take a payment", roles: ["admin", "bursar"] },
      { href: "/reports/debtors", label: "Debtors", roles: ["admin", "bursar"] },
      { href: "/reports/cash", label: "Daily cash", roles: ["admin", "bursar"] },
      { href: "/reports/funds", label: "Funds", roles: ["admin", "bursar"] },
      { href: "/expenditure", label: "Expenditure", roles: ["admin", "bursar"] },
      { href: "/income", label: "Other income", roles: ["admin", "bursar"] },
      { href: "/month-end", label: "Month end", roles: ["admin", "bursar"] },
    ],
  },
  {
    label: "Setup",
    items: [
      { href: "/setup/school", label: "School details", roles: ["admin"] },
      { href: "/setup/terms", label: "Terms and months", roles: ["admin"] },
      { href: "/setup/classes", label: "Classes", roles: ["admin"] },
      { href: "/setup/categories", label: "Fee categories", roles: ["admin"] },
      { href: "/setup/items", label: "Fee items", roles: ["admin"] },
      { href: "/setup/structures", label: "Fee structures", roles: ["admin"] },
      { href: "/setup/receipts", label: "Receipt books", roles: ["admin"] },
      { href: "/setup/currencies", label: "Currencies", roles: ["admin"] },
      { href: "/setup/rates", label: "Exchange rates", roles: ["admin"] },
      { href: "/setup/users", label: "Users", roles: ["admin"] },
      { href: "/activity", label: "Activity log", roles: ["admin"] },
      { href: "/setup/backups", label: "Backups", roles: ["admin"] },
    ],
  },
];

export function Shell({
  user,
  school,
  hasLogo,
  children,
}: {
  user: { username: string; role: Role };
  school: string;
  hasLogo: boolean;
  children: React.ReactNode;
}) {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const roleLabel = user.role === "admin" ? "Admin" : user.role === "bursar" ? "Bursar" : "General";
  const nav = (
    <div className="flex h-full flex-col">
      <Link href="/" className="mb-5 flex items-center gap-2" onClick={() => setOpen(false)}>
        {hasLogo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/api/logo" alt="" className="h-9 w-9 object-contain" />
        ) : (
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-primary font-heading text-sm text-primary-foreground">W</span>
        )}
        <span>
          <span className="block font-heading text-lg leading-none font-semibold">Wese~Kwese</span>
          <span className="text-xs text-muted-foreground">{school}</span>
        </span>
      </Link>
      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {groups.map((group) => {
          const items = group.items.filter((item) => item.roles.includes(user.role));
          if (items.length === 0) return null;
          return (
            <div key={group.label}>
              <p className="mb-1 px-2 text-[0.68rem] font-semibold tracking-[0.14em] text-muted-foreground uppercase">{group.label}</p>
              {items.map((item) => {
                const active = item.href === "/" ? path === "/" : path === item.href || path.startsWith(`${item.href}/`);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setOpen(false)}
                    className={cn(
                      "block rounded-lg px-2 py-1.5 text-sm",
                      active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/80 hover:bg-sidebar-accent/70",
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </div>
      <form action={signOutAction} className="mt-4 border-t border-sidebar-border pt-3">
        <p className="px-2 text-sm font-medium">{user.username}</p>
        <p className="px-2 text-xs text-muted-foreground">{roleLabel}</p>
        <Button type="submit" variant="ghost" className="mt-1 h-8 px-2">
          Sign out
        </Button>
      </form>
    </div>
  );
  return (
    <div className="min-h-screen lg:grid lg:grid-cols-[16.5rem_minmax(0,1fr)]">
      <aside className="no-print sticky top-0 hidden h-screen overflow-hidden border-r border-sidebar-border bg-sidebar p-4 lg:block">{nav}</aside>
      <div className="no-print sticky top-0 z-30 flex items-center justify-between border-b border-border bg-background/95 px-4 py-3 backdrop-blur lg:hidden">
        <Link href="/" className="font-heading text-lg font-semibold">Wese~Kwese</Link>
        <Button variant="outline" className="h-9" onClick={() => setOpen((value) => !value)}>
          {open ? "Close" : "Menu"}
        </Button>
      </div>
      {open ? <div className="no-print border-b border-border bg-sidebar p-4 lg:hidden">{nav}</div> : null}
      <div className="min-w-0">
        <div className="no-print hidden items-center justify-end gap-2 border-b border-border px-6 py-2 lg:flex">
          <form action="/students" className="flex gap-2">
            <input
              name="q"
              placeholder="Find a pupil or number"
              className="h-8 w-64 rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40"
            />
            <Button type="submit" variant="secondary" className="h-8">
              Search
            </Button>
          </form>
        </div>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
        <footer className="no-print px-6 pb-8 text-xs text-muted-foreground">
          Wese~Kwese fees desk · wesekwese@gmail.com · +263 77 314 1598
        </footer>
      </div>
    </div>
  );
}
