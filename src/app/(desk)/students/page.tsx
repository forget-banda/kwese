import Link from "next/link";
import { Flash, PageHeader, Panel, controlClass } from "@/components/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { leaveLabel } from "@/lib/format";
import { classes, listStudents } from "@/lib/queries";

export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q : "";
  const classId = typeof params.class === "string" && params.class ? Number(params.class) : undefined;
  const status = typeof params.status === "string" ? params.status : "";
  const db = getDb();
  const rows = listStudents(db, { q, classId, status });
  const user = await getSessionUser();
  const money = user?.role !== "general";
  return (
    <div>
      <Flash searchParams={searchParams} />
      <PageHeader
        kicker="Register"
        title="Pupils"
        lede="Search by name or student number. Numbers are given by the desk and never typed in."
        actions={
          money ? (
            <Link href="/students/new" className="inline-flex h-10 items-center rounded-lg bg-primary px-3 text-sm text-primary-foreground">
              Add a pupil
            </Link>
          ) : null
        }
      />
      <form className="mb-4 flex flex-wrap gap-2">
        <input name="q" defaultValue={q} placeholder="Name or number" className={`${controlClass} w-48`} />
        <select name="class" defaultValue={classId ?? ""} className={`${controlClass} w-40`}>
          <option value="">Every class</option>
          {classes(db).map((cls) => (
            <option key={cls.id} value={cls.id}>{cls.name}</option>
          ))}
        </select>
        <select name="status" defaultValue={status} className={`${controlClass} w-36`}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="left">Left</option>
        </select>
        <Button type="submit" className="h-10">Filter</Button>
      </form>
      <Panel className="overflow-x-auto p-0">
        {rows.length === 0 ? (
          <p className="p-4 text-sm text-muted-foreground">No pupil matches that search.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-4 py-3">Number</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Class</th>
                {money ? <th className="px-4 py-3">Category</th> : null}
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-border">
                  <td className="px-4 py-2.5 font-mono text-xs">{row.student_number}</td>
                  <td className="px-4 py-2.5">
                    <Link href={`/students/${row.id}`} className="font-medium hover:underline">
                      {row.erased ? "Former Student" : `${row.first_name} ${row.surname}`}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5">{row.class_name ?? "—"}</td>
                  {money ? <td className="px-4 py-2.5">{row.category_name} · {row.currency_code}</td> : null}
                  <td className="px-4 py-2.5">
                    {row.status === "active" ? <Badge variant="secondary">Active</Badge> : <Badge variant="outline">{leaveLabel(row.leave_reason) || "Left"}</Badge>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>
    </div>
  );
}
