import { redirect } from "next/navigation";
import { Flash, PageHeader, Panel, controlClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { getDb, many, one } from "@/lib/db";
import { periodWord, terms } from "@/lib/queries";
import { generateAction } from "@/server/actions";

export default async function GeneratePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user?.role === "general") redirect("/");
  const db = getDb();
  const list = terms(db);
  const params = await searchParams;
  const termId = Number(typeof params.term === "string" ? params.term : list.find((term) => term.is_current)?.id);
  const active = one<{ n: number }>(db, "select count(*) as n from students where status = 'active'")?.n ?? 0;
  const already = termId
    ? one<{ n: number }>(db, "select count(*) as n from invoices where term_id = ?", termId)?.n ?? 0
    : 0;
  const missing = many<{ name: string; currency_code: string }>(
    db,
    `select s.first_name || ' ' || s.surname as name, s.currency_code
     from students s
     where s.status = 'active' and not exists (
       select 1 from fee_structures f where f.category_id = s.category_id and f.term_id = ? and f.currency_code = s.currency_code
     )`,
    termId || 0,
  );
  return (
    <div>
      <Flash searchParams={searchParams} />
      <PageHeader
        kicker="Money"
        title={`Generate ${periodWord(db)} invoices`}
        lede={`${active} active pupils. ${already} already have an invoice for this period and will be left alone.`}
      />
      <Panel className="max-w-xl">
        <form className="mb-4" method="get">
          <select name="term" defaultValue={termId || ""} className={controlClass}>
            {list.map((term) => <option key={term.id} value={term.id}>{term.label} {term.year}{term.is_current ? " · current" : ""}</option>)}
          </select>
          <Button type="submit" variant="outline" className="mt-2 h-9">Preview</Button>
        </form>
        {missing.length > 0 ? (
          <div className="mb-4 text-sm">
            <p className="font-medium">Skipped until a fee structure exists</p>
            <ul className="mt-1 text-muted-foreground">
              {missing.map((row) => <li key={row.name}>{row.name} · {row.currency_code}</li>)}
            </ul>
          </div>
        ) : <p className="mb-4 text-sm text-muted-foreground">Every active pupil has a matching fee structure.</p>}
        <form action={generateAction}>
          <input type="hidden" name="term" value={termId || ""} />
          <Button type="submit" className="h-10">Create the missing invoices</Button>
        </form>
      </Panel>
    </div>
  );
}
