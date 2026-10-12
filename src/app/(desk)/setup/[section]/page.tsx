import { notFound, redirect } from "next/navigation";
import { Flash, PageHeader, Panel, controlClass } from "@/components/bits";
import { Button } from "@/components/ui/button";
import { getSessionUser } from "@/lib/auth";
import { listBackups } from "@/lib/backup";
import { getDb } from "@/lib/db";
import { PAY_METHODS, formatDate, formatMoney, roleLabel } from "@/lib/format";
import {
  categories,
  classes,
  currencies,
  currentTerm,
  feeItems,
  getSchool,
  listUsers,
  rates,
  receiptBooks,
  structureLines,
  structures,
  terms,
} from "@/lib/queries";
import {
  addBookAction,
  addCategoryAction,
  addClassAction,
  addCurrencyAction,
  addItemAction,
  addRateAction,
  addTermAction,
  addUserAction,
  addYearAction,
  backupNowAction,
  copyFeesAction,
  currentTermAction,
  mailBackupAction,
  mailTestAction,
  resetPasswordAction,
  restoreAction,
  saveMailAction,
  saveSchoolAction,
  saveStructureAction,
  unlockAction,
  updateClassAction,
} from "@/server/actions";

export default async function SetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await getSessionUser();
  if (user?.role !== "admin") redirect("/");
  const { section } = await params;
  const db = getDb();
  const body = renderSection(section, db);
  if (!body) notFound();
  return (
    <div>
      <Flash searchParams={searchParams} />
      {body}
    </div>
  );
}

function renderSection(section: string, db: ReturnType<typeof getDb>) {
  if (section === "school") return <School db={db} />;
  if (section === "terms") return <Terms db={db} />;
  if (section === "classes") return <Classes db={db} />;
  if (section === "categories") return <Categories db={db} />;
  if (section === "items") return <Items db={db} />;
  if (section === "structures") return <Structures db={db} />;
  if (section === "receipts") return <Books db={db} />;
  if (section === "currencies") return <Currencies db={db} />;
  if (section === "rates") return <Rates db={db} />;
  if (section === "users") return <Users db={db} />;
  if (section === "backups") return <Backups db={db} />;
  return null;
}

function School({ db }: { db: ReturnType<typeof getDb> }) {
  const school = getSchool(db);
  return (
    <>
      <PageHeader kicker="Setup" title="School details" lede="The name is the first line on every receipt, invoice and download." />
      <Panel className="max-w-xl">
        <form action={saveSchoolAction} className="grid gap-3">
          <label className="grid gap-1 text-sm">School name<input name="name" defaultValue={school.name} className={controlClass} required /></label>
          <label className="grid gap-1 text-sm">Address<input name="address" defaultValue={school.address} className={controlClass} /></label>
          <label className="grid gap-1 text-sm">Phone<input name="phone" defaultValue={school.phone} className={controlClass} /></label>
          <label className="grid gap-1 text-sm">E-mail<input name="email" defaultValue={school.email} className={controlClass} /></label>
          <label className="grid gap-1 text-sm">Fees are billed
            <select name="billing" defaultValue={school.billing} className={controlClass}>
              <option value="term">Each term</option>
              <option value="month">Each month</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">Parents pay
            <select name="paySchedule" defaultValue={school.pay_schedule} className={controlClass}>
              <option value="term">The whole term at the start</option>
              <option value="instalments">In monthly instalments</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">Keep former pupils&apos; details (years)<input name="retention" defaultValue={school.retention_years} className={controlClass} /></label>
          <label className="grid gap-1 text-sm">Sign out after this many quiet minutes<input name="idle" defaultValue={school.idle_minutes} className={controlClass} /></label>
          <label className="grid gap-1 text-sm">School logo<input type="file" name="logo" accept="image/png,image/jpeg" className="text-sm" /></label>
          {school.logo_path ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="removeLogo" value="1" /> Remove the logo</label> : null}
          <Button type="submit" className="h-10 w-fit">Save</Button>
        </form>
      </Panel>
    </>
  );
}

function Terms({ db }: { db: ReturnType<typeof getDb> }) {
  const school = getSchool(db);
  const list = terms(db);
  return (
    <>
      <PageHeader kicker="Setup" title={school.billing === "month" ? "Terms and months" : "Terms"} lede="New invoices and payments default to whichever period is current. Opening and closing dates drive part-term fees and instalments." />
      {school.billing === "month" ? (
        <form action={addYearAction} className="mb-4 flex gap-2">
          <input name="year" defaultValue={new Date().getFullYear()} className={controlClass + " w-32"} />
          <Button type="submit" variant="outline" className="h-10">Add a whole year at once</Button>
        </form>
      ) : null}
      <Panel className="mb-4 max-w-xl">
        <form action={addTermAction} className="grid gap-3">
          <input type="hidden" name="kind" value={school.billing === "month" ? "month" : "term"} />
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">Year<input name="year" defaultValue={2026} className={controlClass} /></label>
            <label className="grid gap-1 text-sm">Number<input name="number" defaultValue={list.length + 1} className={controlClass} /></label>
          </div>
          <label className="grid gap-1 text-sm">Label<input name="label" placeholder="Term 1" className={controlClass} /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-sm">Opens<input type="date" name="opens" className={controlClass} required /></label>
            <label className="grid gap-1 text-sm">Closes<input type="date" name="closes" className={controlClass} required /></label>
          </div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="current" /> Is current</label>
          <Button type="submit" className="h-10 w-fit">Add</Button>
        </form>
      </Panel>
      <ul className="grid gap-2">
        {list.map((term) => (
          <li key={term.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-foreground/10">
            <span>{term.label} {term.year} · {formatDate(term.opens_on)} – {formatDate(term.closes_on)}{term.is_current ? " · current" : ""}</span>
            {term.is_current ? null : (
              <form action={currentTermAction}><input type="hidden" name="id" value={term.id} /><Button type="submit" variant="outline" className="h-8">Make current</Button></form>
            )}
          </li>
        ))}
      </ul>
    </>
  );
}

function Classes({ db }: { db: ReturnType<typeof getDb> }) {
  return (
    <>
      <PageHeader kicker="Setup" title="Classes" lede="Sort order controls end-of-year promotion. Number them from the youngest class to the oldest." />
      <Panel className="mb-4 max-w-lg">
        <form action={addClassAction} className="flex gap-2">
          <input name="name" placeholder="Grade 1" className={controlClass} required />
          <input name="sort" placeholder="Order" className={controlClass + " w-24"} />
          <Button type="submit" className="h-10">Add</Button>
        </form>
      </Panel>
      <ul className="grid gap-2">
        {classes(db).map((cls) => (
          <li key={cls.id}>
            <form action={updateClassAction} className="flex gap-2">
              <input type="hidden" name="id" value={cls.id} />
              <input name="name" defaultValue={cls.name} className={controlClass} />
              <input name="sort" defaultValue={cls.sort_order} className={controlClass + " w-24"} />
              <Button type="submit" variant="outline" className="h-10">Save</Button>
            </form>
          </li>
        ))}
      </ul>
    </>
  );
}

function Categories({ db }: { db: ReturnType<typeof getDb> }) {
  return (
    <>
      <PageHeader kicker="Setup" title="Fee categories" lede="Pupils who pay the same amount share a category: day scholar, boarder, staff child." />
      <form action={addCategoryAction} className="mb-4 flex max-w-lg gap-2">
        <input name="name" className={controlClass} required />
        <Button type="submit" className="h-10">Add</Button>
      </form>
      <ul className="text-sm">{categories(db).map((category) => <li key={category.id} className="border-t border-border py-2">{category.name}</li>)}</ul>
    </>
  );
}

function Items({ db }: { db: ReturnType<typeof getDb> }) {
  return (
    <>
      <PageHeader kicker="Setup" title="Fee items" lede="Each item is also a fund. Keep the list to what you genuinely want to track: tuition, levy, building." />
      <form action={addItemAction} className="mb-4 flex max-w-lg gap-2">
        <input name="name" className={controlClass} required />
        <Button type="submit" className="h-10">Add</Button>
      </form>
      <ul className="text-sm">{feeItems(db).map((item) => <li key={item.id} className="border-t border-border py-2">{item.name}</li>)}</ul>
    </>
  );
}

function Structures({ db }: { db: ReturnType<typeof getDb> }) {
  const items = feeItems(db);
  const list = structures(db);
  const term = currentTerm(db);
  return (
    <>
      <PageHeader kicker="Setup" title="Fee structures" lede="One structure for each fee category, period and currency. A category with no structure for the current period is skipped when invoices are generated." />
      <Panel className="mb-4">
        <form action={saveStructureAction} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <select name="category" className={controlClass}>{categories(db).map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}</select>
            <select name="term" defaultValue={term?.id} className={controlClass}>{terms(db).map((item) => <option key={item.id} value={item.id}>{item.label} {item.year}</option>)}</select>
            <select name="currency" className={controlClass}>{currencies(db).map((currency) => <option key={currency.code} value={currency.code}>{currency.code}</option>)}</select>
          </div>
          {items.map((item) => (
            <label key={item.id} className="grid gap-1 text-sm">{item.name}
              <input name={`item-${item.id}`} defaultValue="0" className={controlClass} />
            </label>
          ))}
          <Button type="submit" className="h-10 w-fit">Save structure</Button>
        </form>
      </Panel>
      <Panel className="mb-4">
        <h2 className="font-heading text-xl">Copy fees to other periods</h2>
        <p className="mb-2 text-sm text-muted-foreground">Anything already set for a period is left as it is.</p>
        <form action={copyFeesAction} className="grid gap-2">
          <select name="from" className={controlClass}>{terms(db).map((item) => <option key={item.id} value={item.id}>{item.label} {item.year}</option>)}</select>
          <div className="flex flex-wrap gap-3 text-sm">
            {terms(db).map((item) => <label key={item.id} className="flex items-center gap-1"><input type="checkbox" name="target" value={item.id} />{item.label}</label>)}
          </div>
          <Button type="submit" variant="outline" className="h-10 w-fit">Copy</Button>
        </form>
      </Panel>
      <ul className="text-sm">
        {list.map((structure) => {
          const lines = structureLines(db, structure.id);
          const symbol = currencies(db).find((currency) => currency.code === structure.currency_code)?.symbol ?? "";
          return (
            <li key={structure.id} className="border-t border-border py-2">
              <span className="font-medium">{structure.category_name} · {structure.term_label} · {structure.currency_code}</span>
              <span className="block text-muted-foreground">
                {lines.map((line) => `${items.find((item) => item.id === line.fee_item_id)?.name} ${formatMoney(line.amount_cents, symbol)}`).join(" · ")}
              </span>
            </li>
          );
        })}
      </ul>
    </>
  );
}

function Books({ db }: { db: ReturnType<typeof getDb> }) {
  return (
    <>
      <PageHeader kicker="Setup" title="Receipt books" lede="A number range, for example 1001 to 1999. Leave method blank for one book used by every payment." />
      <Panel className="mb-4 max-w-xl">
        <form action={addBookAction} className="grid gap-3">
          <input name="name" placeholder="Office book" className={controlClass} />
          <div className="grid grid-cols-3 gap-2">
            <input name="first" placeholder="First" className={controlClass} required />
            <input name="last" placeholder="Last" className={controlClass} required />
            <input name="next" placeholder="Next" className={controlClass} />
          </div>
          <select name="method" className={controlClass}>
            <option value="">Every method</option>
            {PAY_METHODS.map((method) => <option key={method.id} value={method.id}>{method.label}</option>)}
          </select>
          <Button type="submit" className="h-10 w-fit">Add receipt book</Button>
        </form>
      </Panel>
      <ul className="text-sm">
        {receiptBooks(db).map((book) => (
          <li key={book.id} className="border-t border-border py-2">{book.name}: {book.first_number}–{book.last_number}, next {book.next_number}{book.method ? ` · ${book.method}` : ""}</li>
        ))}
      </ul>
    </>
  );
}

function Currencies({ db }: { db: ReturnType<typeof getDb> }) {
  return (
    <>
      <PageHeader kicker="Setup" title="Currencies" lede="Most schools need only one. Add another, such as ZiG beside USD, when the office takes both." />
      <form action={addCurrencyAction} className="mb-4 flex max-w-xl flex-wrap gap-2">
        <input name="code" placeholder="ZIG" className={controlClass + " w-24"} required />
        <input name="symbol" placeholder="ZiG " className={controlClass + " w-28"} required />
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="default" /> Default</label>
        <Button type="submit" className="h-10">Add</Button>
      </form>
      <ul className="text-sm">{currencies(db).map((currency) => <li key={currency.code} className="border-t border-border py-2">{currency.code} · {currency.symbol}{currency.is_default ? " · default" : ""}</li>)}</ul>
    </>
  );
}

function Rates({ db }: { db: ReturnType<typeof getDb> }) {
  const codes = currencies(db);
  return (
    <>
      <PageHeader kicker="Setup" title="Exchange rates" lede="Add a row whenever the rate you are using changes. One unit of the first currency becomes this many of the second." />
      <form action={addRateAction} className="mb-4 flex flex-wrap gap-2">
        <select name="from" className={controlClass + " w-28"}>{codes.map((currency) => <option key={currency.code}>{currency.code}</option>)}</select>
        <select name="to" className={controlClass + " w-28"}>{codes.map((currency) => <option key={currency.code}>{currency.code}</option>)}</select>
        <input name="rate" placeholder="26.5" className={controlClass + " w-28"} required />
        <input type="date" name="on" className={controlClass + " w-40"} required />
        <Button type="submit" className="h-10">Add rate</Button>
      </form>
      <ul className="text-sm">
        {rates(db).map((rate) => <li key={rate.id} className="border-t border-border py-2">1 {rate.from_code} = {rate.rate} {rate.to_code} · {formatDate(rate.effective_on)}</li>)}
      </ul>
    </>
  );
}

function Users({ db }: { db: ReturnType<typeof getDb> }) {
  const rows = listUsers(db);
  return (
    <>
      <PageHeader kicker="Setup" title="Users" lede="A new password is temporary. Five wrong passwords lock a username for 15 minutes." />
      <Panel className="mb-4 max-w-lg">
        <form action={addUserAction} className="flex gap-2">
          <input name="username" placeholder="Username" className={controlClass} required />
          <select name="role" className={controlClass + " w-36"}>
            <option value="bursar">Bursar</option>
            <option value="general">General</option>
            <option value="admin">Admin</option>
          </select>
          <Button type="submit" className="h-10">Add</Button>
        </form>
      </Panel>
      <ul className="grid gap-2">
        {rows.map((row) => (
          <li key={row.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-card px-4 py-3 text-sm ring-1 ring-foreground/10">
            <span>{row.username} · {roleLabel(row.role)}{row.locked_until && row.locked_until > new Date().toISOString() ? " · locked" : ""}{row.must_change_password ? " · must change password" : ""}</span>
            <span className="flex gap-2">
              <form action={resetPasswordAction}><input type="hidden" name="id" value={row.id} /><Button type="submit" variant="outline" className="h-8">Reset password</Button></form>
              <form action={unlockAction}><input type="hidden" name="id" value={row.id} /><Button type="submit" variant="ghost" className="h-8">Unlock</Button></form>
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Backups({ db }: { db: ReturnType<typeof getDb> }) {
  const school = getSchool(db);
  const files = listBackups();
  return (
    <>
      <PageHeader kicker="Setup" title="Backups" lede="A copy is taken on this computer every day after 17:00 Harare time, while the desk is open. The newest 30 are kept." />
      <div className="mb-4 flex flex-wrap gap-2">
        <form action={backupNowAction}><Button type="submit" className="h-10">Back up now</Button></form>
      </div>
      {school.last_mail_error ? <p className="mb-3 text-sm text-destructive">Last e-mail failed: {school.last_mail_error}. The copy on this computer was still made.</p> : null}
      <Panel className="mb-4">
        <h2 className="font-heading text-xl">E-mail a copy</h2>
        <p className="mb-3 text-sm text-muted-foreground">Gmail needs an app password, not your normal password. Server smtp.gmail.com, port 587, STARTTLS. The attachment is AES-256 encrypted and is restored from this page with the same password.</p>
        <form action={saveMailAction} className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <input name="host" defaultValue={school.smtp_host} placeholder="smtp.gmail.com" className={controlClass} />
            <input name="port" defaultValue={school.smtp_port} className={controlClass} />
            <select name="security" defaultValue={school.smtp_security} className={controlClass}>
              <option value="starttls">STARTTLS</option>
              <option value="ssl">SSL</option>
              <option value="none">None</option>
            </select>
          </div>
          <input name="user" defaultValue={school.smtp_user} placeholder="Mail username" className={controlClass} />
          <input name="pass" defaultValue={school.smtp_pass} placeholder="App password" className={controlClass} />
          <input name="from" defaultValue={school.mail_from} placeholder="From address" className={controlClass} />
          <input name="to" defaultValue={school.mail_to} placeholder="Up to 5 addresses, separated by commas" className={controlClass} />
          <input name="backupPassword" defaultValue={school.backup_password} placeholder="Backup password, at least 8 characters" className={controlClass} />
          <Button type="submit" variant="outline" className="h-10 w-fit">Save mail settings</Button>
        </form>
        <div className="mt-3 flex gap-2">
          <form action={mailTestAction}><Button type="submit" variant="secondary" className="h-9">Send a test e-mail</Button></form>
          <form action={mailBackupAction}><Button type="submit" variant="secondary" className="h-9">E-mail the latest backup</Button></form>
        </div>
      </Panel>
      <Panel className="mb-4">
        <h2 className="font-heading text-xl">Restore</h2>
        <p className="mb-3 text-sm text-muted-foreground">A safety copy of the current books is saved first. Type RESTORE to swap the backup in.</p>
        <form action={restoreAction} className="grid gap-3">
          <select name="existing" className={controlClass}>
            <option value="">Choose a backup on this computer</option>
            {files.map((file) => <option key={file.name} value={file.name}>{file.name}</option>)}
          </select>
          <input type="file" name="file" className="text-sm" />
          <input name="password" placeholder="Password, if the file is encrypted" className={controlClass} />
          <input name="confirm" placeholder="Type RESTORE" className={controlClass} />
          <Button type="submit" variant="destructive" className="h-10 w-fit">Restore</Button>
        </form>
      </Panel>
      <ul className="text-sm">
        {files.map((file) => (
          <li key={file.name} className="flex justify-between border-t border-border py-2">
            <span>{file.name}</span>
            <a className="text-primary" href={`/api/backup/${encodeURIComponent(file.name)}`}>Download</a>
          </li>
        ))}
      </ul>
    </>
  );
}
