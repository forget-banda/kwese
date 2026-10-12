import { redirect } from "next/navigation";
import { Money, MoneyNav, PageHeader } from "@/components/bits";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { fundReport } from "@/lib/queries";

export default async function FundsPage() {
  const user = await getSessionUser();
  if (user?.role === "general") redirect("/");
  const rows = fundReport(getDb());
  const usd = rows.filter((row) => row.currency === "USD" && row.kind === "fee");
  const max = Math.max(...usd.map((row) => Math.max(row.income, row.spent)), 1);
  return (
    <div>
      <PageHeader kicker="Reports" title="Funds" lede="Each fee item is its own fund. Closing balance is what has been received, less what has been spent. A fund is not allowed to go below zero." />
      <MoneyNav current="/reports/funds" />
      <div className="no-print mb-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
        <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">USD fee funds · income against expenditure</p>
        {usd.map((row) => (
          <div key={row.name} className="mb-2">
            <div className="mb-1 flex justify-between text-sm"><span>{row.name}</span><span>in <Money cents={row.income} symbol={row.symbol} /> · out <Money cents={row.spent} symbol={row.symbol} /></span></div>
            <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(row.income / max) * 100}%` }} /></div>
          </div>
        ))}
      </div>
      <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">Fund</th>
              <th className="px-4 py-3">Currency</th>
              <th className="px-4 py-3">Income</th>
              <th className="px-4 py-3">Spent</th>
              <th className="px-4 py-3">Closing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.kind}-${row.id}-${row.currency}`} className="border-t border-border">
                <td className="px-4 py-2">{row.name}{row.kind === "other" ? " · other income" : ""}</td>
                <td className="px-4 py-2">{row.currency}</td>
                <td className="px-4 py-2"><Money cents={row.income} symbol={row.symbol} /></td>
                <td className="px-4 py-2"><Money cents={row.spent} symbol={row.symbol} /></td>
                <td className="px-4 py-2"><Money cents={row.closing} symbol={row.symbol} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-sm"><a className="text-primary" href="/api/export/funds?format=xlsx">Download Excel</a> · <a className="text-primary" href="/api/export/funds?format=csv">CSV</a></p>
    </div>
  );
}
