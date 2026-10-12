import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export const controlClass =
  "h-10 w-full rounded-lg border border-input bg-card px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/40";

export function PageHeader({
  kicker,
  title,
  lede,
  actions,
}: {
  kicker?: string;
  title: string;
  lede?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div className="max-w-2xl">
        {kicker ? <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">{kicker}</p> : null}
        <h1 className="font-heading text-3xl font-semibold tracking-tight text-balance">{title}</h1>
        {lede ? <p className="mt-1.5 text-muted-foreground">{lede}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export async function Flash({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : "";
  const notice = typeof params.notice === "string" ? params.notice : "";
  if (!error && !notice) return null;
  return (
    <p
      className={cn(
        "mb-4 rounded-xl px-3 py-2 text-sm",
        error ? "bg-destructive/10 text-destructive" : "bg-accent text-accent-foreground",
      )}
    >
      {error || notice}
    </p>
  );
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function Panel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <section className={cn("rounded-2xl bg-card p-4 ring-1 ring-foreground/10", className)}>{children}</section>;
}

export function Money({ cents, symbol, muted }: { cents: number; symbol: string; muted?: boolean }) {
  const sign = cents < 0 ? "−" : "";
  const text = (Math.abs(cents) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return (
    <span className={cn("tabular-nums", muted && "text-muted-foreground line-through")}>
      {sign}
      {symbol}
      {text}
    </span>
  );
}

export function MoneyNav({ current }: { current: string }) {
  const links = [
    ["/reports/debtors", "Debtors"],
    ["/reports/cash", "Daily cash"],
    ["/reports/funds", "Funds"],
    ["/payments", "Payments"],
    ["/expenditure", "Expenditure"],
    ["/income", "Other income"],
  ];
  return (
    <nav className="no-print mb-5 flex gap-1 overflow-x-auto rounded-xl bg-muted p-1">
      {links.map(([href, label]) => (
        <Link
          key={href}
          href={href}
          className={cn(
            "rounded-lg px-3 py-1.5 text-sm whitespace-nowrap",
            current === href ? "bg-card font-medium shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}

export function DocBanner({
  school,
  title,
  who,
  when,
}: {
  school: { name: string; address: string; phone: string; email: string; logo_path: string | null };
  title: string;
  who?: string;
  when?: string;
}) {
  return (
    <header className="mb-6 flex items-start justify-between gap-4 border-b border-border pb-4">
      <div className="flex items-start gap-3">
        {school.logo_path ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src="/api/logo" alt="" className="h-14 w-14 object-contain" />
        ) : null}
        <div>
          <p className="font-heading text-xl font-semibold">{school.name}</p>
          {school.address ? <p className="text-sm text-muted-foreground">{school.address}</p> : null}
          <p className="text-sm text-muted-foreground">
            {[school.phone, school.email].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>
      <div className="text-right">
        <p className="font-heading text-lg">{title}</p>
        {who ? <p className="text-xs text-muted-foreground">Printed by {who}{when ? ` · ${when}` : ""}</p> : null}
      </div>
    </header>
  );
}

export function TextLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className={buttonVariants({ variant: "outline" })}>
      {children}
    </Link>
  );
}
