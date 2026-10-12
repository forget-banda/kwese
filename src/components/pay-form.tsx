"use client";

import { useMemo, useState } from "react";
import { ActionForm } from "@/components/action-form";
import { controlClass, Field, Money } from "@/components/bits";
import { PAY_METHODS } from "@/lib/format";
import { parseMoney, splitCents } from "@/lib/money";
import type { ActionState } from "@/server/guard";

type InvoiceOption = {
  id: number;
  label: string;
  owing: number;
  symbol: string;
  currency: string;
  lines: { key: string; name: string; cents: number }[];
};

export function PayForm({
  invoices,
  currencies,
  rates,
  blended,
  today,
  action,
}: {
  invoices: InvoiceOption[];
  currencies: { code: string; symbol: string }[];
  rates: { from: string; to: string; rate: number }[];
  blended: boolean;
  today: string;
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
}) {
  const [invoiceId, setInvoiceId] = useState(String(invoices[0]?.id ?? ""));
  const [amount, setAmount] = useState("");
  const [other, setOther] = useState(false);
  const [currency, setCurrency] = useState(invoices[0]?.currency ?? "USD");
  const invoice = invoices.find((item) => String(item.id) === invoiceId) ?? invoices[0];
  const receivedCurrency = other && blended ? currency : invoice?.currency ?? "USD";
  const knownRate = rates.find((rate) => rate.from === receivedCurrency && rate.to === invoice?.currency)?.rate;
  const [rate, setRate] = useState(knownRate ? String(knownRate) : "");

  const preview = useMemo(() => {
    if (!invoice) return null;
    let received = 0;
    try {
      received = amount.trim() ? parseMoney(amount) : 0;
    } catch {
      return { error: "Enter an amount like 120.00" };
    }
    if (!received) return null;
    const converting = receivedCurrency !== invoice.currency;
    const numericRate = Number(rate);
    const applied = converting ? Math.round(received * (Number.isFinite(numericRate) ? numericRate : 0)) : received;
    if (applied > invoice.owing) {
      return { error: `The most this invoice can take is shown above.` };
    }
    if (converting && !(numericRate > 0)) return { error: "Enter the exchange rate." };
    const split = splitCents(
      applied,
      invoice.lines.map((line) => ({ key: line.key, weight: line.cents })),
    );
    return {
      applied,
      lines: invoice.lines.map((line) => ({ name: line.name, cents: split.get(line.key) ?? 0 })).filter((line) => line.cents > 0),
    };
  }, [amount, invoice, rate, receivedCurrency]);

  if (!invoice) return <p>Nothing is owing.</p>;

  return (
    <ActionForm action={action} submit="Record payment" className="grid max-w-xl gap-4">
      <Field label="Towards">
        <select
          name="invoice"
          className={controlClass}
          value={invoiceId}
          onChange={(event) => {
            const next = invoices.find((item) => String(item.id) === event.target.value);
            setInvoiceId(event.target.value);
            if (next) setCurrency(next.currency);
            setOther(false);
          }}
        >
          {invoices.map((item) => (
            <option key={item.id} value={item.id}>
              {item.label}
            </option>
          ))}
        </select>
      </Field>
      <p className="text-sm">
        Still owing <Money cents={invoice.owing} symbol={invoice.symbol} />
      </p>
      <Field label="Amount handed over" hint="Type exactly what was received. The box starts empty on purpose.">
        <input name="amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} className={controlClass} autoComplete="off" />
      </Field>
      <input type="hidden" name="currency" value={receivedCurrency} />
      {blended ? (
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={other}
            onChange={(event) => {
              setOther(event.target.checked);
              if (!event.target.checked) setCurrency(invoice.currency);
            }}
          />
          Received in a different currency?
        </label>
      ) : null}
      {other && blended ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Currency received">
            <select
              className={controlClass}
              value={currency}
              onChange={(event) => {
                setCurrency(event.target.value);
                const found = rates.find((item) => item.from === event.target.value && item.to === invoice.currency);
                if (found) setRate(String(found.rate));
              }}
            >
              {currencies
                .filter((item) => item.code !== invoice.currency)
                .map((item) => (
                  <option key={item.code} value={item.code}>
                    {item.code}
                  </option>
                ))}
            </select>
          </Field>
          <Field label={`Rate into ${invoice.currency}`} hint="How many units of the invoice currency for 1 unit received.">
            <input name="rate" value={rate} onChange={(event) => setRate(event.target.value)} className={controlClass} />
          </Field>
        </div>
      ) : (
        <input type="hidden" name="rate" value="" />
      )}
      <Field label="Date">
        <input type="date" name="paidOn" defaultValue={today} max={today} className={controlClass} required />
      </Field>
      <Field label="How it was paid">
        <select name="method" className={controlClass} defaultValue="cash">
          {PAY_METHODS.map((method) => (
            <option key={method.id} value={method.id}>
              {method.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Note">
        <input name="note" className={controlClass} />
      </Field>
      {preview && "error" in preview ? <p className="text-sm text-destructive">{preview.error}</p> : null}
      {preview && "applied" in preview && preview.applied !== undefined && preview.lines ? (
        <div className="rounded-xl bg-accent px-3 py-2 text-sm">
          <p>
            Applied to the bill: <Money cents={preview.applied} symbol={invoice.symbol} />
          </p>
          <ul className="mt-1 text-muted-foreground">
            {preview.lines.map((line) => (
              <li key={line.name}>
                {line.name}: <Money cents={line.cents} symbol={invoice.symbol} />
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </ActionForm>
  );
}
