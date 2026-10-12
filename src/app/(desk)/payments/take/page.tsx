import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, Panel, controlClass } from "@/components/bits";
import { PayForm } from "@/components/pay-form";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { lineWeights } from "@/lib/commands";
import { getDb } from "@/lib/db";
import { formatMoney } from "@/lib/format";
import { currencies, getSchool, getStudent, rates } from "@/lib/queries";
import { payAction } from "@/server/actions";
import { todayISO } from "@/lib/format";

export default async function TakePaymentPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user?.role === "general") redirect("/");
  const params = await searchParams;
  const studentId = Number(typeof params.student === "string" ? params.student : "0");
  const db = getDb();
  if (!studentId) {
    return (
      <div>
        <PageHeader kicker="Money" title="Take a payment" lede="Find the pupil first. The amount box stays empty until you type what was handed over." />
        <Panel className="max-w-md">
          <form action="/students" className="flex gap-2">
            <input name="q" placeholder="Name or student number" className={controlClass} />
            <Button type="submit" className="h-10">Find</Button>
          </form>
        </Panel>
      </div>
    );
  }
  const student = getStudent(db, studentId);
  if (!student) redirect("/payments/take");
  const open = student.invoices.filter((invoice) => invoice.owing > 0);
  const school = getSchool(db);
  const codes = currencies(db);
  const rateRows = rates(db).map((rate) => ({ from: rate.from_code, to: rate.to_code, rate: rate.rate }));
  return (
    <div>
      <PageHeader
        kicker={student.student_number}
        title={`Payment from ${student.first_name} ${student.surname}`}
        lede="A payment can never be more than what is still owing. It is split across the fee items in proportion."
      />
      {open.length === 0 ? (
        <Panel>
          <p>Every invoice is paid. The take-payment button stays hidden once nothing is owing.</p>
          <Link href={`/students/${student.id}`} className="mt-2 inline-block text-sm text-primary">Back to the pupil</Link>
        </Panel>
      ) : (
        <PayForm
          action={payAction}
          today={todayISO()}
          blended={school.currency_mode === "blended"}
          currencies={codes}
          rates={rateRows}
          invoices={open.map((invoice) => ({
            id: invoice.id,
            label: `${invoice.term_label} · owing ${formatMoney(invoice.owing, invoice.symbol)}`,
            owing: invoice.owing,
            symbol: invoice.symbol,
            currency: invoice.currency_code,
            lines: lineWeights(db, invoice.id).map((line) => ({ key: line.key, name: line.name, cents: line.weight })),
          }))}
        />
      )}
    </div>
  );
}
