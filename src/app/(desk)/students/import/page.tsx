import Link from "next/link";
import { redirect } from "next/navigation";
import { Flash, PageHeader, Panel, controlClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { categories, classes, importBatch } from "@/lib/queries";
import { checkSheetsAction, commitSheetsAction } from "@/server/actions";

export default async function ImportPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user?.role === "general") redirect("/");
  const params = await searchParams;
  const batchId = typeof params.batch === "string" ? params.batch : "";
  const db = getDb();
  const batch = batchId ? importBatch(db, batchId) : null;
  const ready = batch?.rows.filter((row) => row.problems.length === 0).length ?? 0;
  return (
    <div>
      <Flash searchParams={searchParams} />
      <PageHeader
        kicker="Register"
        title="Import from sheets"
        lede="Give each teacher a class sheet. When they come back, check them here before anyone is added."
        actions={<a href="/api/sheets" className="inline-flex h-10 items-center rounded-lg border border-border bg-card px-3 text-sm">Download the sheets</a>}
      />
      <Panel className="mb-4 max-w-2xl">
        <form action={checkSheetsAction} className="grid gap-3">
          <label className="grid gap-1.5 text-sm">
            <span className="font-medium">Filled sheets</span>
            <input type="file" name="files" accept=".xlsx,.csv" multiple required className="text-sm" />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Fee category if a row leaves it blank</span>
              <select name="category" className={controlClass}>
                {categories(db).map((category) => <option key={category.id}>{category.name}</option>)}
              </select>
            </label>
            <label className="grid gap-1.5 text-sm">
              <span className="font-medium">Class if a sheet has no class column</span>
              <select name="className" className={controlClass}>
                <option value="">Use the sheet</option>
                {classes(db).map((cls) => <option key={cls.id}>{cls.name}</option>)}
              </select>
            </label>
          </div>
          <Button type="submit" className="h-10 w-fit">Check the sheets</Button>
        </form>
      </Panel>
      {batch ? (
        <Panel>
          <h2 className="font-heading text-xl">{batch.fileName}</h2>
          <p className="text-sm text-muted-foreground">{ready} can be added. Rows with problems are left out. Pupils already on the register are skipped.</p>
          <ul className="mt-3 max-h-80 space-y-1 overflow-auto text-sm">
            {batch.rows.map((row) => (
              <li key={`${row.row}-${row.surname}`} className={row.problems.length ? "text-destructive" : ""}>
                Row {row.row}: {row.firstName} {row.surname} {row.className ? `· ${row.className}` : ""}
                {row.problems.length ? ` — ${row.problems.join("; ")}` : " — will be added"}
              </li>
            ))}
          </ul>
          <form action={commitSheetsAction} className="mt-4">
            <input type="hidden" name="batch" value={batchId} />
            <Button type="submit" className="h-10" disabled={ready === 0}>Add {ready} pupils</Button>
          </form>
        </Panel>
      ) : (
        <p className="text-sm text-muted-foreground">Nothing is saved until you press Add. <Link href="/students" className="underline">Back to the register.</Link></p>
      )}
    </div>
  );
}
