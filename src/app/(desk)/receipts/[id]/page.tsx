import { notFound, redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { DocBanner, Flash, Money, PageHeader, Panel, controlClass } from "@/components/bits";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate, methodLabel } from "@/lib/format";
import { getReceipt, getSchool } from "@/lib/queries";
import { voidPayAction } from "@/server/actions";

export default async function ReceiptPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user?.role === "general") redirect("/");
  const { id } = await params;
  const receipt = getReceipt(getDb(), Number(id));
  if (!receipt) notFound();
  const school = getSchool(getDb());
  const sp = await searchParams;
  const fresh = sp.fresh === "1";
  return (
    <div>
      <Flash searchParams={searchParams} />
      <PageHeader
        kicker={fresh ? "Receipt ready" : "Receipt"}
        title={String(receipt.receipt_number)}
        lede={`${receipt.first_name} ${receipt.surname} · ${receipt.student_number}`}
      />
      <Panel className={receipt.voided_at ? "opacity-80" : ""}>
        <DocBanner school={school} title={receipt.voided_at ? "Voided receipt" : "Official receipt"} who={receipt.username ?? undefined} when={formatDate(receipt.paid_on)} />
        {receipt.voided_at ? <p className="mb-3 text-sm text-destructive">Voided{receipt.voidedBy ? ` by ${receipt.voidedBy}` : ""}: {receipt.void_reason}</p> : null}
        <dl className="grid grid-cols-2 gap-y-2 text-sm">
          <dt className="text-muted-foreground">Invoice</dt><dd>{receipt.invoice_number} · {receipt.term_label}</dd>
          <dt className="text-muted-foreground">Class when billed</dt><dd>{receipt.class_name}</dd>
          <dt className="text-muted-foreground">Method</dt><dd>{methodLabel(receipt.method)}</dd>
          <dt className="text-muted-foreground">Received by</dt><dd>{receipt.username}</dd>
        </dl>
        <p className="mt-4 font-heading text-4xl"><Money cents={receipt.amount_cents} symbol={receipt.symbol} /></p>
        {receipt.received_currency !== receipt.currency_code ? (
          <p className="text-sm text-muted-foreground">
            Handed over <Money cents={receipt.received_cents} symbol={receipt.receivedSymbol} /> at rate {receipt.rate}, applied as <Money cents={receipt.amount_cents} symbol={receipt.symbol} />.
          </p>
        ) : null}
        <ul className="mt-4 text-sm">
          {receipt.allocations.map((line) => (
            <li key={line.fee_item_name} className="flex justify-between border-t border-border py-1">
              <span>{line.fee_item_name}</span>
              <Money cents={line.amount_cents} symbol={receipt.symbol} />
            </li>
          ))}
        </ul>
        {receipt.note ? <p className="mt-3 text-sm">{receipt.note}</p> : null}
      </Panel>
      <p className="no-print mt-3 text-xs text-muted-foreground">Print this page for the parent&apos;s copy, or save it as a PDF from the print dialog.</p>
      {!receipt.voided_at ? (
        <Panel className="no-print mt-4 max-w-lg">
          <h2 className="font-heading text-xl">Void this receipt</h2>
          <p className="mb-3 text-sm text-muted-foreground">The record stays. If some of the money has already been spent from a fund, void that expenditure first.</p>
          <ActionForm action={voidPayAction} submit="Void receipt" variant="destructive">
            <input type="hidden" name="id" value={receipt.id} />
            <input name="reason" required placeholder="Reason" className={controlClass} />
          </ActionForm>
        </Panel>
      ) : null}
    </div>
  );
}
