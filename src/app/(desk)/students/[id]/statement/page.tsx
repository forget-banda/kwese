import { notFound } from "next/navigation";
import { DocBanner, Money, Panel } from "@/components/bits";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate, leaveLabel } from "@/lib/format";
import { getSchool, getStudent } from "@/lib/queries";

export default async function StatementPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const db = getDb();
  const student = getStudent(db, Number(id));
  if (!student) notFound();
  const user = await getSessionUser();
  const school = getSchool(db);
  const name = student.erased ? "Former Student" : `${student.first_name} ${student.surname}`;
  const owing = student.invoices.reduce((sum, invoice) => sum + Math.max(0, invoice.owing), 0);
  return (
    <Panel>
      <DocBanner school={school} title="Student statement" who={user?.username} when={formatDate(new Date().toISOString())} />
      <h1 className="font-heading text-3xl">{name}</h1>
      <p className="text-sm text-muted-foreground">{student.student_number} · {student.class_name}</p>
      {student.status === "left" ? (
        <p className="mt-2 text-sm">Left {formatDate(student.left_on)} · {leaveLabel(student.leave_reason)}{student.leave_destination ? ` · ${student.leave_destination}` : ""}</p>
      ) : <p className="mt-2 text-sm">Still on the register.</p>}
      <p className="mt-4 text-lg">{owing === 0 ? "Fees are cleared." : "Fees are not cleared."}</p>
      <table className="mt-4 w-full text-sm">
        <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
          <tr><th className="py-2">Period</th><th>Invoice</th><th>Net</th><th>Paid</th><th>Owing</th></tr>
        </thead>
        <tbody>
          {student.invoices.map((invoice) => (
            <tr key={invoice.id} className="border-t border-border">
              <td className="py-1.5">{invoice.term_label}</td>
              <td>{invoice.number}</td>
              <td><Money cents={invoice.net} symbol={invoice.symbol} /></td>
              <td><Money cents={invoice.paid} symbol={invoice.symbol} /></td>
              <td><Money cents={invoice.owing} symbol={invoice.symbol} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="no-print mt-6 text-xs text-muted-foreground">Print this page for a receiving school.</p>
    </Panel>
  );
}
