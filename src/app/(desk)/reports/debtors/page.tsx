import Link from "next/link";
import { redirect } from "next/navigation";
import { Money, MoneyNav, PageHeader, controlClass } from "@/components/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate, leaveLabel, todayISO } from "@/lib/format";
import { classes, debtors, terms } from "@/lib/queries";

export default async function DebtorsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user?.role === "general") redirect("/");
  const params = await searchParams;
  const db = getDb();
  const termId = typeof params.term === "string" ? Number(params.term) : undefined;
  const classId = typeof params.class === "string" && params.class ? Number(params.class) : undefined;
  const behind = params.behind === "1";
  const asAt = typeof params.asAt === "string" ? params.asAt : todayISO();
  const report = debtors(db, { termId, classId, behind, asAt });
  const byClass = new Map<string, number>();
  for (const row of report.rows) {
    if (row.currency_code === "USD") byClass.set(row.class_name, (byClass.get(row.class_name) ?? 0) + row.owing);
  }
  const max = Math.max(...byClass.values(), 1);
  return (
    <div>
      <PageHeader kicker="Reports" title="Debtors" lede={report.term ? `${report.term.label} as at ${formatDate(report.asAt)}.` : "Add a term first."} />
      <MoneyNav current="/reports/debtors" />
      <form className="no-print mb-4 flex flex-wrap gap-2">
        <select name="term" defaultValue={report.term?.id ?? ""} className={controlClass + " w-40"}>
          {terms(db).map((term) => <option key={term.id} value={term.id}>{term.label}</option>)}
        </select>
        <select name="class" defaultValue={classId ?? ""} className={controlClass + " w-40"}>
          <option value="">Every class</option>
          {classes(db).map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
        </select>
        <input type="date" name="asAt" defaultValue={report.asAt} max={todayISO()} className={controlClass + " w-40"} />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="behind" value="1" defaultChecked={behind} /> Only those behind</label>
        <Button type="submit" className="h-10">Show</Button>
        <a className="inline-flex h-10 items-center text-sm text-primary" href={`/api/export/debtors?term=${report.term?.id ?? ""}&class=${classId ?? ""}&behind=${behind ? "1" : ""}&asAt=${report.asAt}&format=xlsx`}>Excel</a>
        <a className="inline-flex h-10 items-center text-sm text-primary" href={`/api/export/debtors?term=${report.term?.id ?? ""}&class=${classId ?? ""}&behind=${behind ? "1" : ""}&asAt=${report.asAt}&format=csv`}>CSV</a>
      </form>
      {byClass.size > 0 ? (
        <div className="no-print mb-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="mb-2 text-xs tracking-wide text-muted-foreground uppercase">USD owing by class</p>
          {[...byClass.entries()].map(([label, cents]) => (
            <div key={label} className="mb-1 grid grid-cols-[6rem_1fr_auto] items-center gap-2 text-sm">
              <span>{label}</span>
              <div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${(cents / max) * 100}%` }} /></div>
              <Money cents={cents} symbol="$" />
            </div>
          ))}
        </div>
      ) : null}
      {report.rows.length === 0 ? <p className="text-sm text-muted-foreground">Nobody matches this filter.</p> : (
        <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
          <table className="w-full text-sm">
            <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3">Pupil</th>
                <th className="px-4 py-3">Class</th>
                <th className="px-4 py-3">Owing</th>
                <th className="px-4 py-3">Due by now</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-2">
                    <Link href={`/students/${row.student_id}`} className="font-medium hover:underline">{row.first_name} {row.surname}</Link>
                    <span className="block text-xs text-muted-foreground">{row.student_number}{row.status === "left" ? ` · ${leaveLabel(row.leave_reason)}` : ""}</span>
                  </td>
                  <td className="px-4 py-2">{row.class_name}</td>
                  <td className="px-4 py-2"><Money cents={row.owing} symbol={row.symbol} /></td>
                  <td className="px-4 py-2">
                    {row.scheduled ? <Money cents={row.due} symbol={row.symbol} /> : "—"}
                    {row.behind ? <Badge variant="destructive" className="ml-2">Behind</Badge> : null}
                  </td>
                  <td className="px-4 py-2"><Link href={`/payments/take?student=${row.student_id}`} className="text-primary">Take payment</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
