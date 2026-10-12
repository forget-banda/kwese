import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { DocBanner, Flash, Money, PageHeader, Panel, controlClass } from "@/components/bits";
import { Badge } from "@/components/ui/badge";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate, formatWhen, methodLabel } from "@/lib/format";
import { getInvoice, getSchool } from "@/lib/queries";
import { adjustAction, voidAdjustAction } from "@/server/actions";

export default async function InvoicePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user?.role === "general") redirect("/");
  const { id } = await params;
  const db = getDb();
  const invoice = getInvoice(db, Number(id));
  if (!invoice) notFound();
  const school = getSchool(db);
  const name = `${invoice.first_name} ${invoice.surname}`.trim();
  return (
    <div>
      <Flash searchParams={searchParams} />
      <PageHeader
        kicker={invoice.term_label}
        title={invoice.number}
        lede={`${name} · ${invoice.student_number} · billed in ${invoice.class_name}`}
        actions={invoice.totals.owing > 0 ? <Link href={`/payments/take?student=${invoice.student_id}&invoice=${invoice.id}`} className="inline-flex h-10 items-center rounded-lg bg-primary px-3 text-sm text-primary-foreground">Take payment</Link> : null}
      />
      <Panel className="mb-4">
        <DocBanner school={school} title="Invoice" who={user?.username} when={formatDate(new Date().toISOString())} />
        <table className="w-full text-sm">
          <tbody>
            {invoice.lines.map((line) => (
              <tr key={line.id} className="border-t border-border">
                <td className="py-1.5">{line.fee_item_name}</td>
                <td className="py-1.5 text-right"><Money cents={line.amount_cents} symbol={invoice.symbol} /></td>
              </tr>
            ))}
            {invoice.adjustments.filter((row) => !row.voided_at).map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="py-1.5">Reduction · {row.reason}</td>
                <td className="py-1.5 text-right"><Money cents={row.amount_cents} symbol={invoice.symbol} /></td>
              </tr>
            ))}
            <tr className="border-t border-border font-medium">
              <td className="py-2">Still owing</td>
              <td className="py-2 text-right"><Money cents={invoice.totals.owing} symbol={invoice.symbol} /></td>
            </tr>
          </tbody>
        </table>
        {invoice.position?.behind ? <Badge variant="destructive" className="mt-3">Behind the instalment schedule</Badge> : null}
        {invoice.plan ? (
          <div className="mt-4">
            <h2 className="font-heading text-lg">Instalment plan</h2>
            <table className="mt-2 w-full text-sm">
              <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
                <tr><th className="py-1">Due</th><th>Should have paid</th></tr>
              </thead>
              <tbody>
                {invoice.plan.map((step) => (
                  <tr key={step.date} className="border-t border-border">
                    <td className="py-1">{formatDate(step.date)}</td>
                    <td><Money cents={step.due} symbol={invoice.symbol} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </Panel>
      <Panel className="mb-4">
        <h2 className="font-heading text-xl">Payments</h2>
        <ul className="mt-2 text-sm">
          {invoice.payments.map((payment) => (
            <li key={payment.id} className="flex justify-between border-t border-border py-1.5">
              <Link href={`/receipts/${payment.id}`} className={payment.voided_at ? "line-through" : ""}>
                {payment.receipt_number} · {formatDate(payment.paid_on)} · {methodLabel(payment.method)}
              </Link>
              <Money cents={payment.amount_cents} symbol={invoice.symbol} muted={Boolean(payment.voided_at)} />
            </li>
          ))}
        </ul>
      </Panel>
      {user?.role === "admin" ? (
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel>
            <h2 className="font-heading text-xl">Adjust fees</h2>
            <p className="mb-3 text-sm text-muted-foreground">A bursary, a part-term fee, a correction, or a debt written off. It cannot take off more than what is still owing.</p>
            <ActionForm action={adjustAction} submit="Reduce fees">
              <input type="hidden" name="invoice" value={invoice.id} />
              <label className="grid gap-1 text-sm">Amount to take off<input name="amount" className={controlClass} /></label>
              <label className="grid gap-1 text-sm">Reason<input name="reason" className={controlClass} required /></label>
            </ActionForm>
          </Panel>
          <Panel>
            <h2 className="font-heading text-xl">Reductions</h2>
            {invoice.adjustments.length === 0 ? <p className="text-sm text-muted-foreground">None.</p> : invoice.adjustments.map((row) => (
              <div key={row.id} className={`mt-3 border-t border-border pt-3 text-sm ${row.voided_at ? "text-muted-foreground line-through" : ""}`}>
                <p><Money cents={row.amount_cents} symbol={invoice.symbol} /> · {row.reason}</p>
                <p className="text-xs">{row.username} · {formatWhen(row.created_at)}</p>
                {row.voided_at ? null : (
                  <form action={voidAdjustAction} className="mt-2 grid gap-2 no-underline">
                    <input type="hidden" name="invoice" value={invoice.id} />
                    <input type="hidden" name="id" value={row.id} />
                    <input name="reason" placeholder="Why this reduction is being voided" className={controlClass} required />
                    <button className="h-8 text-left text-sm text-destructive" type="submit">Void this reduction</button>
                  </form>
                )}
              </div>
            ))}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
