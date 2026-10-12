import { redirect } from "next/navigation";
import { Flash, PageHeader, Panel } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { classes, latestPromotion, promotionPreview } from "@/lib/queries";
import { promoteAction, undoPromoteAction } from "@/server/actions";
import { formatWhen } from "@/lib/format";

export default async function PromotePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user?.role === "general") redirect("/");
  const db = getDb();
  const plan = promotionPreview(db);
  const last = latestPromotion(db);
  const all = classes(db);
  return (
    <div>
      <Flash searchParams={searchParams} />
      <PageHeader
        kicker="Register"
        title="End-of-year promotion"
        lede="Each class is offered the next one by sort order. Tick anyone repeating. Nothing changes until you confirm. Past invoices keep the class they were billed in."
      />
      {last && !last.undone_at ? (
        <form action={undoPromoteAction} className="mb-4">
          <Button type="submit" variant="outline" className="h-10">Undo the promotion from {formatWhen(last.created_at)}</Button>
        </form>
      ) : null}
      <form action={promoteAction} className="grid gap-4">
        {plan.map((cls) => (
          <Panel key={cls.id}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-heading text-xl">{cls.name}</h2>
              <label className="flex items-center gap-2 text-sm">
                Goes to
                <select name={`dest-${cls.id}`} defaultValue={cls.destination} className="h-9 rounded-lg border border-input bg-card px-2">
                  {all.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  <option value="finish">Finishes school</option>
                </select>
              </label>
            </div>
            {cls.pupils.length === 0 ? <p className="text-sm text-muted-foreground">No active pupils.</p> : (
              <ul className="grid gap-1 text-sm sm:grid-cols-2">
                {cls.pupils.map((pupil) => (
                  <li key={pupil.id}>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" name={`repeat-${pupil.id}`} />
                      <span>{pupil.surname}, {pupil.first_name}</span>
                      <span className="text-xs text-muted-foreground">{pupil.student_number}</span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2 text-xs text-muted-foreground">Tick a name to keep them in {cls.name}.</p>
          </Panel>
        ))}
        <Button type="submit" className="h-10 w-fit">Confirm promotion</Button>
      </form>
    </div>
  );
}
