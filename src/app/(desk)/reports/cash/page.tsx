import { redirect } from "next/navigation";
import { Money, MoneyNav, PageHeader, controlClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { symbolOf } from "@/lib/commands";
import { getDb } from "@/lib/db";
import { methodLabel, todayISO } from "@/lib/format";
import { dailyCash } from "@/lib/queries";

export default async function CashPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user?.role === "general") redirect("/");
  const params = await searchParams;
  const today = todayISO();
  const from = typeof params.from === "string" ? params.from : today;
  const to = typeof params.to === "string" ? params.to : today;
  const db = getDb();
  const report = dailyCash(db, from, to);
  const byMethod = new Map<string, number>();
  const byWho = new Map<string, number>();
  let fees = 0;
  for (const row of report.payments.filter((item) => item.currency_code === "USD")) {
    fees += row.amount_cents;
    byMethod.set(row.method, (byMethod.get(row.method) ?? 0) + row.amount_cents);
    byWho.set(row.username ?? "Unknown", (byWho.get(row.username ?? "Unknown") ?? 0) + row.amount_cents);
  }
  const zig = report.payments.filter((item) => item.currency_code === "ZIG").reduce((sum, row) => sum + row.amount_cents, 0);
  const other = report.income.reduce((sum, row) => sum + (row.currency_code === "USD" ? row.amount_cents : 0), 0);
  const max = Math.max(...byMethod.values(), 1);
  return (
    <div>
      <PageHeader kicker="Reports" title="Daily cash" lede="What came in, and how, between these dates. Run it at the end of the day." />
      <MoneyNav current="/reports/cash" />
      <form className="no-print mb-4 flex flex-wrap gap-2">
        <input type="date" name="from" defaultValue={report.from} max={today} className={controlClass + " w-40"} />
        <input type="date" name="to" defaultValue={report.to} max={today} className={controlClass + " w-40"} />
        <Button type="submit" className="h-10">Show</Button>
        <a className="inline-flex h-10 items-center text-sm text-primary" href={`/api/export/cash?from=${report.from}&to=${report.to}&format=csv`}>CSV</a>
        <a className="inline-flex h-10 items-center text-sm text-primary" href={`/api/export/cash?from=${report.from}&to=${report.to}&format=xlsx`}>Excel</a>
      </form>
      {report.clamped ? <p className="mb-3 text-sm">A date after today was replaced with today.</p> : null}
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10"><p className="text-xs uppercase text-muted-foreground">Fee receipts · USD</p><p className="font-heading text-3xl"><Money cents={fees} symbol="$" /></p></div>
        <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10"><p className="text-xs uppercase text-muted-foreground">Fee receipts · ZiG</p><p className="font-heading text-3xl"><Money cents={zig} symbol={symbolOf(db, "ZIG")} /></p></div>
        <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10"><p className="text-xs uppercase text-muted-foreground">Other income · USD</p><p className="font-heading text-3xl"><Money cents={other} symbol="$" /></p></div>
      </div>
      <div className="no-print mb-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">USD payment methods</p>
        {[...byMethod.entries()].map(([method, cents]) => (
          <div key={method} className="mb-1 grid grid-cols-[7rem_1fr_auto] items-center gap-2 text-sm">
            <span>{methodLabel(method)}</span>
            <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-chart-2" style={{ width: `${(cents / max) * 100}%` }} /></div>
            <Money cents={cents} symbol="$" />
          </div>
        ))}
      </div>
      <div className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <h2 className="font-heading text-xl">By who received it · USD fees</h2>
        <ul className="mt-2 text-sm">
          {[...byWho.entries()].map(([name, cents]) => (
            <li key={name} className="flex justify-between border-t border-border py-1"><span>{name}</span><Money cents={cents} symbol="$" /></li>
          ))}
        </ul>
      </div>
    </div>
  );
}
