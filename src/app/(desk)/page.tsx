import Link from "next/link";
import { Flash, Money, PageHeader, Panel } from "@/components/bits";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { currencyModeAction, dismissSampleAction } from "@/server/actions";
import { getDb } from "@/lib/db";
import { formatDate, methodLabel } from "@/lib/format";
import { checklist, currencies, dashboard } from "@/lib/queries";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  const db = getDb();
  const desk = dashboard(db);
  const setup = checklist(db);
  const money = user?.role !== "general";
  const codes = currencies(db);
  return (
    <div>
      <Flash searchParams={searchParams} />
      {desk.school.is_sample && !desk.school.hide_sample_banner ? (
        <Panel className="mb-5 flex flex-wrap items-center justify-between gap-3 bg-accent">
          <p className="max-w-2xl text-sm">
            These are sample books for Chiedza Primary, so you can learn the desk. They are not a real school&apos;s records.
            Sign in as admin, bursar, or teacher — the passwords are on the sign-in page.
          </p>
          {user?.role === "admin" ? (
            <form action={dismissSampleAction}>
              <Button type="submit" variant="outline" className="h-9 bg-card">
                Hide this note
              </Button>
            </form>
          ) : null}
        </Panel>
      ) : null}
      <PageHeader
        kicker={desk.term ? `${desk.term.label} ${desk.term.year}` : "Fees desk"}
        title={desk.school.name || "Set up the school"}
        lede={
          money
            ? desk.term
              ? `${formatDate(desk.term.opens_on)} – ${formatDate(desk.term.closes_on)}. Parents on the instalment schedule are measured as at today.`
              : "Add the current term before invoices can be raised."
            : "Class lists and the register. Money stays with the bursar."
        }
      />
      {!setup.ready && user?.role === "admin" ? (
        <Panel className="mb-6">
          <h2 className="font-heading text-xl">Getting started</h2>
          <ol className="mt-3 grid gap-2">
            {setup.items.map((item, index) => (
              <li key={item.id} className="flex items-center justify-between gap-3 text-sm">
                <span>
                  <span className="mr-2 text-muted-foreground">{index + 1}.</span>
                  {item.label}
                </span>
                {item.done ? <Badge variant="secondary">Done</Badge> : <Link href={item.href} className="text-primary underline-offset-4 hover:underline">Do this</Link>}
              </li>
            ))}
          </ol>
        </Panel>
      ) : null}
      <div className="mb-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Panel>
          <p className="text-xs tracking-wide text-muted-foreground uppercase">Active pupils</p>
          <p className="font-heading text-3xl">{desk.active}</p>
          <p className="text-sm text-muted-foreground">{desk.left} former</p>
        </Panel>
        {money
          ? desk.blocks.map((block) => (
              <Panel key={block.code}>
                <p className="text-xs tracking-wide text-muted-foreground uppercase">Collected · {block.code}</p>
                <p className="font-heading text-3xl">
                  <Money cents={block.collected} symbol={block.symbol} />
                </p>
                <p className="text-sm text-muted-foreground">
                  of <Money cents={block.invoiced} symbol={block.symbol} /> invoiced · owing{" "}
                  <Money cents={block.owing} symbol={block.symbol} />
                </p>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${block.invoiced ? Math.min(100, (block.collected / block.invoiced) * 100) : 0}%` }}
                  />
                </div>
              </Panel>
            ))
          : null}
        {money ? (
          <Panel>
            <p className="text-xs tracking-wide text-muted-foreground uppercase">Behind schedule</p>
            <p className="font-heading text-3xl">{desk.behind.length}</p>
            <Link href="/reports/debtors?behind=1" className="text-sm text-primary underline-offset-4 hover:underline">
              Open the debtors list
            </Link>
          </Panel>
        ) : null}
      </div>
      {money && codes.length > 1 && user?.role === "admin" ? (
        <Panel className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">Currency mode · {desk.school.currency_mode === "blended" ? "Blended" : "Strict"}</p>
            <p className="text-sm text-muted-foreground">
              {desk.school.currency_mode === "blended"
                ? "A payment can be converted into the invoice currency. Reports still show one currency at a time."
                : "A payment must be in the invoice currency. Nothing is converted."}
            </p>
          </div>
          <form action={currencyModeAction}>
            <input type="hidden" name="mode" value={desk.school.currency_mode === "blended" ? "strict" : "blended"} />
            <Button type="submit" variant="outline" className="h-9">
              Change to {desk.school.currency_mode === "blended" ? "strict" : "blended"}
            </Button>
          </form>
        </Panel>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        {money ? (
          <Panel>
            <h2 className="font-heading text-xl">Behind as at today</h2>
            {desk.behind.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nobody is behind the instalment schedule.</p>
            ) : (
              <ul className="mt-3 divide-y divide-border">
                {desk.behind.slice(0, 8).map((row) => (
                  <li key={row.studentId} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <Link href={`/students/${row.studentId}`} className="hover:underline">
                      <span className="font-medium">{row.name}</span>
                      <span className="block text-xs text-muted-foreground">{row.className} · {row.number}</span>
                    </Link>
                    <Link href={`/payments/take?student=${row.studentId}`} className="text-primary">
                      Take payment
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        ) : (
          <Panel>
            <h2 className="font-heading text-xl">Class lists</h2>
            <p className="mt-2 text-sm text-muted-foreground">Print a register without money figures.</p>
            <Link href="/students/class-list" className="mt-3 inline-block text-sm text-primary underline-offset-4 hover:underline">
              Open class lists
            </Link>
          </Panel>
        )}
        {money ? (
          <Panel>
            <h2 className="font-heading text-xl">Latest receipts</h2>
            <ul className="mt-3 divide-y divide-border">
              {desk.recent.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <Link href={`/receipts/${row.id}`} className={row.voided_at ? "text-muted-foreground line-through" : "hover:underline"}>
                    {row.receipt_number} · {row.first_name} {row.surname}
                    <span className="block text-xs text-muted-foreground">{formatDate(row.paid_on)} · {methodLabel(row.method)}</span>
                  </Link>
                  <Money
                    cents={row.amount_cents}
                    symbol={desk.blocks.find((block) => block.code === row.currency_code)?.symbol ?? ""}
                    muted={Boolean(row.voided_at)}
                  />
                </li>
              ))}
            </ul>
          </Panel>
        ) : null}
      </div>
      {desk.school.last_mail_error && user?.role === "admin" ? (
        <p className="mt-4 text-sm text-destructive">Backup e-mail failed: {desk.school.last_mail_error}</p>
      ) : null}
    </div>
  );
}
