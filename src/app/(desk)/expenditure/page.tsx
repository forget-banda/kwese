import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Flash, Money, MoneyNav, PageHeader, Panel, controlClass } from "@/components/bits";
import { getSessionUser } from "@/lib/auth";
import { symbolOf } from "@/lib/commands";
import { getDb } from "@/lib/db";
import { formatDate, todayISO } from "@/lib/format";
import { listExpenditure, spendableFunds } from "@/lib/queries";
import { spendAction, voidSpendAction } from "@/server/actions";

export default async function ExpenditurePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user?.role === "general") redirect("/");
  const db = getDb();
  const funds = spendableFunds(db);
  const rows = listExpenditure(db);
  return (
    <div>
      <Flash searchParams={searchParams} />
      <PageHeader kicker="Money" title="Expenditure" lede="You can only spend what a fund holds. The balance is shown in the list." />
      <MoneyNav current="/expenditure" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          {funds.length === 0 ? <p className="text-sm text-muted-foreground">No fund has money to spend.</p> : (
            <ActionForm action={spendAction} submit="Record expenditure">
              <label className="grid gap-1 text-sm">Spend from fund
                <select name="fund" className={controlClass}>
                  {funds.map((fund) => <option key={fund.key} value={fund.key}>{fund.label}</option>)}
                </select>
              </label>
              <label className="grid gap-1 text-sm">Amount<input name="amount" className={controlClass} /></label>
              <label className="grid gap-1 text-sm">What it was for<input name="description" className={controlClass} required /></label>
              <label className="grid gap-1 text-sm">Date<input type="date" name="spentOn" defaultValue={todayISO()} max={todayISO()} className={controlClass} required /></label>
            </ActionForm>
          )}
        </Panel>
        <Panel>
          <h2 className="font-heading text-xl">History</h2>
          <ul className="mt-2 text-sm">
            {rows.length === 0 ? <li className="text-muted-foreground">Nothing spent yet.</li> : rows.map((row) => (
              <li key={row.id} className="border-t border-border py-2">
                <div className={`flex justify-between ${row.voided_at ? "text-muted-foreground line-through" : ""}`}>
                  <span>{row.fund_name} · {row.description}</span>
                  <Money cents={row.amount_cents} symbol={symbolOf(db, row.currency_code)} />
                </div>
                <p className="text-xs text-muted-foreground">{formatDate(row.spent_on)} · {row.username}{row.void_reason ? ` · voided: ${row.void_reason}` : ""}</p>
                {row.voided_at ? null : (
                  <ActionForm action={voidSpendAction} submit="Void" variant="ghost" className="mt-1 flex flex-wrap items-center gap-2">
                    <input type="hidden" name="id" value={row.id} />
                    <input name="reason" required placeholder="Reason" className={controlClass + " max-w-xs"} />
                  </ActionForm>
                )}
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}
