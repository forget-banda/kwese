import { redirect } from "next/navigation";
import { PageHeader, Panel, controlClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatWhen, todayISO } from "@/lib/format";
import { listActivity } from "@/lib/queries";

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect("/");
  const params = await searchParams;
  const today = todayISO();
  const from = typeof params.from === "string" ? params.from : today.slice(0, 8) + "01";
  const to = typeof params.to === "string" ? params.to : today;
  const rows = listActivity(getDb(), from, to);
  return (
    <div>
      <PageHeader kicker="Admin" title="Activity log" lede="Who changed the books, and when. Dates cannot look past today." />
      <form className="mb-4 flex gap-2">
        <input type="date" name="from" defaultValue={from} max={today} className={controlClass + " w-40"} />
        <input type="date" name="to" defaultValue={to} max={today} className={controlClass + " w-40"} />
        <Button type="submit" className="h-10">Show</Button>
      </form>
      <Panel className="p-0">
        <ul className="divide-y divide-border text-sm">
          {rows.map((row) => (
            <li key={row.id} className="px-4 py-2">
              <span className="font-medium">{row.action}</span> · {row.detail}
              <span className="block text-xs text-muted-foreground">{row.username} · {formatWhen(row.at)}</span>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
