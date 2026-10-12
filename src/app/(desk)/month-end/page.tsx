import { redirect } from "next/navigation";
import { Flash, PageHeader, Panel, controlClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatWhen, monthName } from "@/lib/format";
import { closedMonths } from "@/lib/queries";
import { closeMonthAction, reopenMonthAction } from "@/server/actions";

export default async function MonthEndPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user?.role === "general") redirect("/");
  const db = getDb();
  const closed = closedMonths(db);
  const year = new Date().getFullYear();
  return (
    <div>
      <Flash searchParams={searchParams} />
      <PageHeader kicker="Money" title="Month end" lede="Once a month is closed, nothing can be recorded or voided in it until an admin reopens it. This is the calendar month, whether the school bills by term or by month." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <form action={closeMonthAction} className="grid gap-3">
            <label className="grid gap-1 text-sm">Year<input name="year" defaultValue={year} className={controlClass} /></label>
            <label className="grid gap-1 text-sm">Month
              <select name="month" className={controlClass} defaultValue={new Date().getMonth() === 0 ? 12 : new Date().getMonth()}>
                {Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>{monthName(index + 1)}</option>)}
              </select>
            </label>
            <Button type="submit" className="h-10 w-fit">Close month</Button>
          </form>
        </Panel>
        <Panel>
          <h2 className="font-heading text-xl">Closed</h2>
          {closed.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No month is closed.</p> : (
            <ul className="mt-2 text-sm">
              {closed.map((row) => (
                <li key={`${row.year}-${row.month}`} className="flex items-center justify-between border-t border-border py-2">
                  <span>{monthName(row.month)} {row.year}<span className="block text-xs text-muted-foreground">{formatWhen(row.closed_at)}</span></span>
                  {user?.role === "admin" ? (
                    <form action={reopenMonthAction}>
                      <input type="hidden" name="year" value={row.year} />
                      <input type="hidden" name="month" value={row.month} />
                      <Button type="submit" variant="outline" className="h-8">Reopen</Button>
                    </form>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
