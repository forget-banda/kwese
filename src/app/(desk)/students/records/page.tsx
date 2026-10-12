import { redirect } from "next/navigation";
import { Flash, PageHeader, Panel } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate, leaveLabel } from "@/lib/format";
import { oldRecords } from "@/lib/queries";
import { eraseBulkAction, eraseOneAction } from "@/server/actions";

export default async function RecordsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect("/");
  const db = getDb();
  const rows = oldRecords(db);
  const years = rows[0]?.retention ?? 7;
  return (
    <div>
      <Flash searchParams={searchParams} />
      <PageHeader
        kicker="Admin"
        title="Old records"
        lede={`Personal details are kept for ${years} years after a pupil leaves. Erasing replaces the name with Former Student and keeps the number, invoices and receipts. It cannot be undone. Older backup files still hold the details as they were.`}
      />
      <form action={eraseBulkAction} className="mb-4">
        <Button type="submit" variant="outline" className="h-10">Erase details past {years} years, where nothing is owing</Button>
      </form>
      <Panel className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-4 py-3">Number</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Left</th>
              <th className="px-4 py-3">Owing</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id} className="border-t border-border">
                <td className="px-4 py-2 font-mono text-xs">{row.student_number}</td>
                <td className="px-4 py-2">{row.erased ? "Former Student" : `${row.first_name} ${row.surname}`}</td>
                <td className="px-4 py-2">{formatDate(row.left_on)} · {leaveLabel(row.leave_reason)}</td>
                <td className="px-4 py-2">{row.owing ? "Still owing" : "Clear"}</td>
                <td className="px-4 py-2">
                  {row.erased ? null : (
                    <form action={eraseOneAction}>
                      <input type="hidden" name="id" value={row.id} />
                      <Button type="submit" variant="ghost" className="h-8 text-destructive">Erase details</Button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Panel>
    </div>
  );
}
