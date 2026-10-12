import Link from "next/link";
import { redirect } from "next/navigation";
import { Flash, Money, PageHeader, TextLink } from "@/components/bits";
import { Badge } from "@/components/ui/badge";
import { getSessionUser } from "@/lib/auth";
import { invoiceTotals, symbolOf } from "@/lib/commands";
import { getDb, many } from "@/lib/db";
import { currentTerm } from "@/lib/queries";

export default async function InvoicesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user?.role === "general") redirect("/");
  const db = getDb();
  const term = currentTerm(db);
  const rows = term
    ? many<{ id: number; number: string; class_name: string; currency_code: string; first_name: string; surname: string; student_number: string }>(
        db,
        `select i.id, i.number, i.class_name, i.currency_code, s.first_name, s.surname, s.student_number
         from invoices i join students s on s.id = i.student_id
         where i.term_id = ? order by i.class_name, s.surname`,
        term.id,
      )
    : [];
  return (
    <div>
      <Flash searchParams={searchParams} />
      <PageHeader
        kicker={term?.label}
        title="Invoices"
        lede="Running generate again leaves invoices that already exist."
        actions={<TextLink href="/invoices/generate">Generate</TextLink>}
      />
      <div className="overflow-x-auto rounded-2xl bg-card ring-1 ring-foreground/10">
        <table className="w-full text-sm">
          <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">Invoice</th>
              <th className="px-4 py-3">Pupil</th>
              <th className="px-4 py-3">Class</th>
              <th className="px-4 py-3">Owing</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const totals = invoiceTotals(db, row.id);
              return (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-2"><Link href={`/invoices/${row.id}`} className="hover:underline">{row.number}</Link></td>
                  <td className="px-4 py-2">{row.first_name} {row.surname}<span className="block font-mono text-xs text-muted-foreground">{row.student_number}</span></td>
                  <td className="px-4 py-2">{row.class_name}</td>
                  <td className="px-4 py-2">
                    <Money cents={totals.owing} symbol={symbolOf(db, row.currency_code)} />
                    {totals.owing === 0 ? <Badge variant="secondary" className="ml-2">Paid</Badge> : null}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
