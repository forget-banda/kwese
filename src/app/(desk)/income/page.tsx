import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Flash, Money, MoneyNav, PageHeader, Panel, controlClass } from "@/components/bits";
import { getSessionUser } from "@/lib/auth";
import { symbolOf } from "@/lib/commands";
import { getDb } from "@/lib/db";
import { PAY_METHODS, formatDate, methodLabel, todayISO } from "@/lib/format";
import { currencies, listOtherIncome, otherCategories } from "@/lib/queries";
import { incomeAction, voidIncomeAction } from "@/server/actions";

export default async function IncomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user?.role === "general") redirect("/");
  const db = getDb();
  const rows = listOtherIncome(db);
  return (
    <div>
      <Flash searchParams={searchParams} />
      <PageHeader kicker="Money" title="Other income" lede="Uniform sales, hall hire, tuck. Pick a category so the same thing is spelled the same way in the funds." />
      <MoneyNav current="/income" />
      <div className="grid gap-4 lg:grid-cols-2">
        <Panel>
          <ActionForm action={incomeAction} submit="Record other income">
            <label className="grid gap-1 text-sm">Category
              <select name="category" className={controlClass}>
                <option value="">Choose</option>
                {otherCategories(db).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">Or add a category<input name="newCategory" className={controlClass} placeholder="Hall hire" /></label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">Amount<input name="amount" className={controlClass} /></label>
              <label className="grid gap-1 text-sm">Currency
                <select name="currency" className={controlClass}>
                  {currencies(db).map((currency) => <option key={currency.code} value={currency.code}>{currency.code}</option>)}
                </select>
              </label>
            </div>
            <label className="grid gap-1 text-sm">How it was received
              <select name="method" className={controlClass}>
                {PAY_METHODS.map((method) => <option key={method.id} value={method.id}>{method.label}</option>)}
              </select>
            </label>
            <label className="grid gap-1 text-sm">Date<input type="date" name="receivedOn" defaultValue={todayISO()} max={todayISO()} className={controlClass} required /></label>
            <label className="grid gap-1 text-sm">Note<input name="description" className={controlClass} /></label>
          </ActionForm>
        </Panel>
        <Panel>
          <h2 className="font-heading text-xl">Received</h2>
          <ul className="mt-2 text-sm">
            {rows.map((row) => (
              <li key={row.id} className="border-t border-border py-2">
                <div className={`flex justify-between ${row.voided_at ? "line-through text-muted-foreground" : ""}`}>
                  <span>{row.category_name} · {methodLabel(row.method)}</span>
                  <Money cents={row.amount_cents} symbol={symbolOf(db, row.currency_code)} />
                </div>
                <p className="text-xs text-muted-foreground">{formatDate(row.received_on)} · {row.description}</p>
                {row.voided_at ? null : (
                  <ActionForm action={voidIncomeAction} submit="Void" variant="ghost" className="mt-1 flex flex-wrap items-center gap-2">
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
