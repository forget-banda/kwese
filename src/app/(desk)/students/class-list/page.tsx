import { DocBanner, PageHeader, Panel, controlClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate } from "@/lib/format";
import { classList, classes, getSchool } from "@/lib/queries";

export default async function ClassListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const selected = typeof params.class === "string" && params.class ? Number(params.class) : "all";
  const columns = typeof params.columns === "string" ? params.columns : "";
  const db = getDb();
  const lists = classList(db, selected === "all" || Number.isNaN(selected) ? "all" : selected);
  const user = await getSessionUser();
  const school = getSchool(db);
  return (
    <div>
      <PageHeader kicker="Register" title="Class list" lede="No money figures, so any signed-in member of staff can print it." />
      <form className="no-print mb-4 flex flex-wrap gap-2">
        <select name="class" defaultValue={selected === "all" ? "all" : String(selected)} className={`${controlClass} w-48`}>
          <option value="all">Every class</option>
          {classes(db).map((cls) => <option key={cls.id} value={cls.id}>{cls.name}</option>)}
        </select>
        <select name="columns" defaultValue={columns} className={`${controlClass} w-56`}>
          <option value="">Names only</option>
          <option value="register">Empty column for a register</option>
          <option value="marks">Empty columns for marks</option>
        </select>
        <Button type="submit" className="h-10">Show</Button>
      </form>
      <p className="no-print mb-4 text-xs text-muted-foreground">Use the browser print dialog for a paper register or a PDF.</p>
      {lists.length === 0 ? <p>No classes yet.</p> : lists.map((cls) => (
        <Panel key={cls.id} className="mb-6 print:break-after-page">
          <DocBanner school={school} title={cls.name} who={user?.username} when={formatDate(new Date().toISOString())} />
          <table className="w-full text-sm">
            <thead className="text-left text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="py-2">Number</th>
                <th>Name</th>
                <th>Gender</th>
                <th>Date of birth</th>
                {columns === "register" ? <th className="w-24">Present</th> : null}
                {columns === "marks" ? <><th className="w-16">1</th><th className="w-16">2</th><th className="w-16">3</th></> : null}
              </tr>
            </thead>
            <tbody>
              {cls.pupils.length === 0 ? <tr><td className="py-2 text-muted-foreground" colSpan={4}>No active pupils.</td></tr> : cls.pupils.map((pupil) => (
                <tr key={pupil.student_number} className="border-t border-border">
                  <td className="py-1.5 font-mono text-xs">{pupil.student_number}</td>
                  <td>{pupil.surname}, {pupil.first_name}</td>
                  <td>{pupil.gender}</td>
                  <td>{formatDate(pupil.dob)}</td>
                  {columns === "register" ? <td className="border-b border-border" /> : null}
                  {columns === "marks" ? <><td /><td /><td /></> : null}
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ))}
    </div>
  );
}
