import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { Flash, Money, PageHeader, Panel, TextLink, controlClass } from "@/components/bits";
import { LeaveFields, StudentFields } from "@/components/student-fields";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { partTermSuggestion } from "@/lib/commands";
import { getDb, many } from "@/lib/db";
import { formatDate, leaveLabel, methodLabel } from "@/lib/format";
import { categories, classes, currencies, currentTerm, getStudent } from "@/lib/queries";
import { adjustAction, billOneAction, leaveAction, returnAction, updateStudentAction } from "@/server/actions";

export default async function StudentPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = await params;
  const db = getDb();
  const student = getStudent(db, Number(id));
  if (!student) notFound();
  const user = await getSessionUser();
  const money = user?.role !== "general";
  const owing = student.invoices.some((invoice) => invoice.owing > 0);
  const term = currentTerm(db);
  const suggestion = student.status === "left" ? partTermSuggestion(db, student.id) : null;
  const name = student.erased ? "Former Student" : `${student.first_name} ${student.surname}`;
  return (
    <div>
      <Flash searchParams={searchParams} />
      <PageHeader
        kicker={student.student_number}
        title={name}
        lede={`${student.class_name ?? "No class"}${money && student.category_name ? ` · ${student.category_name} · billed in ${student.currency_code}` : ""}`}
        actions={
          <>
            {money && owing ? <TextLink href={`/payments/take?student=${student.id}`}>Take payment</TextLink> : null}
            <TextLink href={`/students/${student.id}/statement`}>Statement</TextLink>
          </>
        }
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {student.status === "active" ? <Badge>Active</Badge> : <Badge variant="outline">Left · {leaveLabel(student.leave_reason)}{student.left_on ? ` · ${formatDate(student.left_on)}` : ""}</Badge>}
        {student.leave_destination ? <Badge variant="secondary">{student.leave_destination}</Badge> : null}
      </div>
      {money ? (
        <Panel className="mb-4 overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3">Invoice</th>
                <th className="px-4 py-3">Class billed</th>
                <th className="px-4 py-3">Net</th>
                <th className="px-4 py-3">Paid</th>
                <th className="px-4 py-3">Owing</th>
                <th className="px-4 py-3">Due by now</th>
              </tr>
            </thead>
            <tbody>
              {student.invoices.length === 0 ? (
                <tr><td className="px-4 py-3 text-muted-foreground" colSpan={6}>No invoices yet.</td></tr>
              ) : student.invoices.map((invoice) => (
                <tr key={invoice.id} className="border-t border-border">
                  <td className="px-4 py-2.5"><Link href={`/invoices/${invoice.id}`} className="hover:underline">{invoice.number}<span className="block text-xs text-muted-foreground">{invoice.term_label}</span></Link></td>
                  <td className="px-4 py-2.5">{invoice.class_name}</td>
                  <td className="px-4 py-2.5"><Money cents={invoice.net} symbol={invoice.symbol} /></td>
                  <td className="px-4 py-2.5"><Money cents={invoice.paid} symbol={invoice.symbol} /></td>
                  <td className="px-4 py-2.5"><Money cents={invoice.owing} symbol={invoice.symbol} /></td>
                  <td className="px-4 py-2.5">
                    {invoice.due == null ? "—" : <Money cents={invoice.due} symbol={invoice.symbol} />}
                    {invoice.behind ? <Badge variant="destructive" className="ml-2">Behind</Badge> : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : null}
      {money && student.status === "active" && term && !student.invoices.some((invoice) => invoice.term_id === term.id) ? (
        <form action={billOneAction} className="mb-4">
          <input type="hidden" name="student" value={student.id} />
          <input type="hidden" name="term" value={term.id} />
          <Button type="submit" variant="outline" className="h-10">Create the {term.label} invoice</Button>
        </form>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {!student.erased && money ? (
          <Panel>
            <h2 className="font-heading text-xl">Details</h2>
            <p className="mb-3 text-xs text-muted-foreground">Changing class or fee category does not rebill an invoice already generated.</p>
            <ActionForm action={updateStudentAction} submit="Save details">
              <input type="hidden" name="id" value={student.id} />
              <StudentFields
                classes={classes(db)}
                categories={categories(db)}
                currencies={currencies(db)}
                values={student}
              />
            </ActionForm>
          </Panel>
        ) : (
          <Panel>
            <h2 className="font-heading text-xl">Details</h2>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
              <dt className="text-muted-foreground">Gender</dt><dd>{student.gender || "—"}</dd>
              <dt className="text-muted-foreground">Date of birth</dt><dd>{formatDate(student.dob) || "—"}</dd>
              <dt className="text-muted-foreground">Guardian</dt><dd>{student.guardian || "—"}</dd>
              <dt className="text-muted-foreground">Phone</dt><dd>{student.phone || "—"}</dd>
            </dl>
          </Panel>
        )}
        {money ? (
          <div className="grid gap-4">
            {student.status === "active" ? (
              <Panel>
                <h2 className="font-heading text-xl">Record leaving</h2>
                <p className="mb-3 text-sm text-muted-foreground">Nobody is deleted. Receipts stay. They drop off class lists and new invoices.</p>
                <ActionForm action={leaveAction} submit="Record leaving" variant="outline">
                  <input type="hidden" name="id" value={student.id} />
                  <LeaveFields />
                </ActionForm>
              </Panel>
            ) : (
              <Panel>
                <h2 className="font-heading text-xl">Bring back</h2>
                <p className="mb-3 text-sm text-muted-foreground">For someone entered by mistake, or who is returning.</p>
                <form action={returnAction}>
                  <input type="hidden" name="id" value={student.id} />
                  <Button type="submit" className="h-10">Bring back as an active pupil</Button>
                </form>
                {suggestion && suggestion.reduction > 0 && user?.role === "admin" ? (
                  <div className="mt-4 border-t border-border pt-4">
                    <p className="text-sm">
                      A fair fee for the days attended in {suggestion.term} is <Money cents={suggestion.fair} symbol={suggestion.symbol} />.
                      The rest still owing is <Money cents={suggestion.reduction} symbol={suggestion.symbol} />.
                    </p>
                    <ActionForm action={adjustAction} submit="Reduce the invoice by that amount" className="mt-3 grid gap-3">
                      <input type="hidden" name="invoice" value={suggestion.invoiceId} />
                      <input type="hidden" name="amount" value={(suggestion.reduction / 100).toFixed(2)} />
                      <input type="hidden" name="reason" value={`Part-term fee on leaving, ${suggestion.term}`} />
                      <p className="text-xs text-muted-foreground">Invoice {suggestion.invoiceNumber}</p>
                    </ActionForm>
                  </div>
                ) : null}
              </Panel>
            )}
          </div>
        ) : null}
      </div>
      {money ? <PaymentList studentId={student.id} /> : null}
    </div>
  );
}

function PaymentList({ studentId }: { studentId: number }) {
  const rows = many<{
    id: number;
    receipt_number: number;
    amount_cents: number;
    paid_on: string;
    method: string;
    voided_at: string | null;
    symbol: string;
  }>(
    getDb(),
    `select p.id, p.receipt_number, p.amount_cents, p.paid_on, p.method, p.voided_at, c.symbol
     from payments p
     join invoices i on i.id = p.invoice_id
     join currencies c on c.code = i.currency_code
     where i.student_id = ? order by p.id desc`,
    studentId,
  );
  return (
    <Panel className="mt-4">
      <h2 className="font-heading text-xl">Payments</h2>
      {rows.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">No payments yet.</p> : (
        <ul className="mt-2 divide-y divide-border text-sm">
          {rows.map((row) => (
            <li key={row.id} className="flex justify-between py-2">
              <Link href={`/receipts/${row.id}`} className={row.voided_at ? "text-muted-foreground line-through" : "hover:underline"}>
                {row.receipt_number} · {formatDate(row.paid_on)} · {methodLabel(row.method)}
              </Link>
              <Money cents={row.amount_cents} symbol={row.symbol} muted={Boolean(row.voided_at)} />
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
