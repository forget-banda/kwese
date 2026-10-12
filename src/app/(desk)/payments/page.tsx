import Link from "next/link";
import { redirect } from "next/navigation";
import { Flash, Money, MoneyNav, PageHeader, controlClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate, methodLabel, todayISO } from "@/lib/format";
import { symbolOf } from "@/lib/commands";
import { listPayments } from "@/lib/queries";

export default async function PaymentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user?.role === "general") redirect("/");
  const params = await searchParams;
  const today = todayISO();
  const from = typeof params.from === "string" ? params.from : today.slice(0, 8) + "01";
  const to = typeof params.to === "string" ? params.to : today;
  const db = getDb();
  const report = listPayments(db, from, to);
  return (
    <div>
      <Flash searchParams={searchParams} />
      <PageHeader kicker="Money" title="Payments" lede="Voided receipts stay on the list, struck through, with the reason kept." />
      <MoneyNav current="/payments" />
      <form className="mb-4 flex flex-wrap gap-2">
        <input type="date" name="from" defaultValue={report.from} max={today} className={controlClass + " w-40"} />
        <input type="date" name="to" defaultValue={report.to} max={today} className={controlClass + " w-40"} />
        <Button type="submit" className="h-10">Show</Button>
        <a className="inline-flex h-10 items-center text-sm text-primary" href={`/api/export/payments?from=${report.from}&to=${report.to}&format=csv`}>CSV</a>
        <a className="inline-flex h-10 items-center text-sm text-primary" href={`/api/export/payments?from=${report.from}&to=${report.to}&format=xlsx`}>Excel</a>
      </form>
      {report.clamped ? <p className="mb-3 text-sm text-muted-foreground">A future date was replaced with today.</p> : null}
      <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">Receipt</th>
              <th className="px-4 py-3">Pupil</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Method</th>
              <th className="px-4 py-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-4 py-2"><Link href={`/receipts/${row.id}`} className={row.voided_at ? "line-through" : "hover:underline"}>{row.receipt_number}</Link></td>
                <td className="px-4 py-2">{row.first_name} {row.surname}</td>
                <td className="px-4 py-2">{formatDate(row.paid_on)}</td>
                <td className="px-4 py-2">{methodLabel(row.method)}{row.username ? ` · ${row.username}` : ""}</td>
                <td className="px-4 py-2"><Money cents={row.amount_cents} symbol={symbolOf(db, row.currency_code)} muted={Boolean(row.voided_at)} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
