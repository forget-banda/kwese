import type { DB } from "./db";
import { many, one } from "./db";
import { fundBalance, invoiceTotals, positionOnSchedule, schoolOf, symbolOf } from "./commands";
import { formatMoney, todayISO } from "./format";
import { dueCents, instalmentDates } from "./money";

export type SchoolRow = {
  id: number;
  name: string;
  address: string;
  phone: string;
  email: string;
  logo_path: string | null;
  billing: string;
  pay_schedule: string;
  currency_mode: string;
  idle_minutes: number;
  retention_years: number;
  is_sample: number;
  hide_sample_banner: number;
  smtp_host: string;
  smtp_port: number;
  smtp_security: string;
  smtp_user: string;
  smtp_pass: string;
  mail_from: string;
  mail_to: string;
  backup_password: string;
  last_auto_backup: string | null;
  last_mail_error: string | null;
  last_mail_at: string | null;
};

export function getSchool(db: DB) {
  return one<SchoolRow>(db, "select * from school where id = 1")!;
}

export function currencies(db: DB) {
  return many<{ code: string; symbol: string; is_default: number }>(
    db,
    "select code, symbol, is_default from currencies order by sort_order, code",
  );
}

export function defaultCurrency(db: DB) {
  return (
    currencies(db).find((currency) => currency.is_default) ??
    currencies(db)[0] ?? { code: "USD", symbol: "$", is_default: 1 }
  );
}

export function terms(db: DB) {
  return many<{
    id: number;
    year: number;
    number: number;
    label: string;
    opens_on: string;
    closes_on: string;
    is_current: number;
    kind: string;
  }>(db, "select * from terms order by year, number");
}

export function currentTerm(db: DB) {
  return terms(db).find((term) => term.is_current) ?? null;
}

export function classes(db: DB) {
  return many<{ id: number; name: string; sort_order: number }>(
    db,
    "select * from classes order by sort_order, name",
  );
}

export function categories(db: DB) {
  return many<{ id: number; name: string }>(db, "select * from fee_categories order by name");
}

export function feeItems(db: DB) {
  return many<{ id: number; name: string; sort_order: number }>(
    db,
    "select * from fee_items order by sort_order, name",
  );
}

export function periodWord(db: DB) {
  return getSchool(db).billing === "month" ? "month" : "term";
}

export function checklist(db: DB) {
  const school = getSchool(db);
  const term = currentTerm(db);
  const items = [
    { id: "school", label: "School name on receipts", done: school.name.trim().length > 0, href: "/setup/school" },
    { id: "term", label: `Current ${periodWord(db)}`, done: Boolean(term), href: "/setup/terms" },
    { id: "classes", label: "Classes, youngest first", done: classes(db).length > 0, href: "/setup/classes" },
    {
      id: "fees",
      label: "Fee categories and fee items",
      done: categories(db).length > 0 && feeItems(db).length > 0,
      href: "/setup/categories",
    },
    {
      id: "structure",
      label: "A fee structure for the current period",
      done: term
        ? Boolean(one(db, "select id from fee_structures where term_id = ? limit 1", term.id))
        : false,
      href: "/setup/structures",
    },
    {
      id: "book",
      label: "A receipt book with numbers left",
      done: Boolean(
        one(db, "select id from receipt_books where active = 1 and next_number <= last_number limit 1"),
      ),
      href: "/setup/receipts",
    },
    {
      id: "pupils",
      label: "Pupils on the register",
      done: (one<{ n: number }>(db, "select count(*) as n from students")?.n ?? 0) > 0,
      href: "/students/new",
    },
  ];
  return { items, ready: items.every((item) => item.done) };
}

export function dashboard(db: DB) {
  const school = getSchool(db);
  const term = currentTerm(db);
  const symbolMap = new Map(currencies(db).map((currency) => [currency.code, currency.symbol]));
  const active = one<{ n: number }>(db, "select count(*) as n from students where status = 'active'")?.n ?? 0;
  const left = one<{ n: number }>(db, "select count(*) as n from students where status = 'left'")?.n ?? 0;
  if (!term) {
    return { school, term: null, active, left, blocks: [], behind: [], recent: [], byClass: [] };
  }
  const invoices = many<{ id: number; currency_code: string; class_name: string; student_id: number }>(
    db,
    "select id, currency_code, class_name, student_id from invoices where term_id = ?",
    term.id,
  );
  const blocksMap = new Map<string, { invoiced: number; collected: number; owing: number }>();
  const classMap = new Map<string, number>();
  const behind: {
    studentId: number;
    name: string;
    number: string;
    className: string;
    owing: number;
    due: number;
    symbol: string;
    currency: string;
  }[] = [];
  for (const invoice of invoices) {
    const totals = invoiceTotals(db, invoice.id);
    const block = blocksMap.get(invoice.currency_code) ?? { invoiced: 0, collected: 0, owing: 0 };
    block.invoiced += totals.net;
    block.collected += totals.paid;
    block.owing += Math.max(0, totals.owing);
    blocksMap.set(invoice.currency_code, block);
    if (totals.owing > 0) classMap.set(invoice.class_name, (classMap.get(invoice.class_name) ?? 0) + totals.owing);
    const position = positionOnSchedule(db, invoice.id, todayISO());
    if (position?.behind) {
      const student = one<{ id: number; first_name: string; surname: string; student_number: string }>(
        db,
        "select id, first_name, surname, student_number from students where id = ?",
        invoice.student_id,
      );
      if (student) {
        behind.push({
          studentId: student.id,
          name: `${student.first_name} ${student.surname}`.trim(),
          number: student.student_number,
          className: invoice.class_name,
          owing: totals.owing,
          due: position.due,
          symbol: symbolMap.get(invoice.currency_code) ?? "",
          currency: invoice.currency_code,
        });
      }
    }
  }
  const recent = many<{
    id: number;
    receipt_number: number;
    amount_cents: number;
    currency_code: string;
    method: string;
    paid_on: string;
    voided_at: string | null;
    first_name: string;
    surname: string;
    student_number: string;
  }>(
    db,
    `select p.id, p.receipt_number, p.amount_cents, i.currency_code, p.method, p.paid_on, p.voided_at,
            s.first_name, s.surname, s.student_number
     from payments p
     join invoices i on i.id = p.invoice_id
     join students s on s.id = i.student_id
     order by p.id desc limit 6`,
  );
  const blocks = [...blocksMap.entries()].map(([code, totals]) => ({
    code,
    symbol: symbolMap.get(code) ?? `${code} `,
    ...totals,
  }));
  const byClass = [...classMap.entries()]
    .map(([label, cents]) => ({ label, cents }))
    .sort((a, b) => b.cents - a.cents);
  return { school, term, active, left, blocks, behind, recent, byClass };
}

export type StudentListRow = {
  id: number;
  student_number: string;
  surname: string;
  first_name: string;
  gender: string;
  class_name: string | null;
  category_name: string | null;
  currency_code: string;
  status: string;
  leave_reason: string | null;
  erased: number;
};

export function listStudents(
  db: DB,
  filters: { q?: string; classId?: number; status?: string },
) {
  const clauses = ["1=1"];
  const params: unknown[] = [];
  if (filters.q) {
    clauses.push("(s.student_number like ? or s.surname like ? or s.first_name like ? or (s.first_name || ' ' || s.surname) like ?)");
    const like = `%${filters.q.trim()}%`;
    params.push(like, like, like, like);
  }
  if (filters.classId) {
    clauses.push("s.class_id = ?");
    params.push(filters.classId);
  }
  if (filters.status === "active" || filters.status === "left") {
    clauses.push("s.status = ?");
    params.push(filters.status);
  }
  return many<StudentListRow>(
    db,
    `select s.id, s.student_number, s.surname, s.first_name, s.gender, s.currency_code, s.status,
            s.leave_reason, s.erased, c.name as class_name, f.name as category_name
     from students s
     left join classes c on c.id = s.class_id
     left join fee_categories f on f.id = s.category_id
     where ${clauses.join(" and ")}
     order by c.sort_order, s.surname, s.first_name`,
    ...params,
  );
}

export function getStudent(db: DB, id: number) {
  const student = one<
    StudentListRow & {
      class_id: number | null;
      category_id: number | null;
      dob: string | null;
      address: string;
      guardian: string;
      phone: string;
      doctor: string;
      emergency: string;
      notes: string;
      left_on: string | null;
      leave_destination: string | null;
    }
  >(
    db,
    `select s.*, c.name as class_name, f.name as category_name
     from students s
     left join classes c on c.id = s.class_id
     left join fee_categories f on f.id = s.category_id
     where s.id = ?`,
    id,
  );
  if (!student) return null;
  const invoices = many<{
    id: number;
    number: string;
    term_id: number;
    term_label: string;
    class_name: string;
    currency_code: string;
    opens_on: string;
    closes_on: string;
  }>(
    db,
    `select i.id, i.number, i.term_id, i.class_name, i.currency_code, t.label as term_label, t.opens_on, t.closes_on
     from invoices i join terms t on t.id = i.term_id
     where i.student_id = ? order by t.year, t.number`,
    id,
  ).map((invoice) => {
    const totals = invoiceTotals(db, invoice.id);
    const position = positionOnSchedule(db, invoice.id, todayISO());
    return {
      ...invoice,
      ...totals,
      symbol: symbolOf(db, invoice.currency_code),
      due: position?.due ?? null,
      behind: position?.behind ?? false,
    };
  });
  return { ...student, invoices };
}

export function getInvoice(db: DB, id: number) {
  const invoice = one<{
    id: number;
    number: string;
    student_id: number;
    term_id: number;
    class_name: string;
    currency_code: string;
    created_at: string;
    term_label: string;
    opens_on: string;
    closes_on: string;
    student_number: string;
    first_name: string;
    surname: string;
    status: string;
    leave_reason: string | null;
  }>(
    db,
    `select i.*, t.label as term_label, t.opens_on, t.closes_on,
            s.student_number, s.first_name, s.surname, s.status, s.leave_reason
     from invoices i
     join terms t on t.id = i.term_id
     join students s on s.id = i.student_id
     where i.id = ?`,
    id,
  );
  if (!invoice) return null;
  const lines = many<{ id: number; fee_item_name: string; amount_cents: number }>(
    db,
    "select id, fee_item_name, amount_cents from invoice_lines where invoice_id = ? order by id",
    id,
  );
  const adjustments = many<{
    id: number;
    amount_cents: number;
    reason: string;
    created_at: string;
    voided_at: string | null;
    void_reason: string | null;
    username: string | null;
  }>(
    db,
    `select a.*, u.username from adjustments a
     left join users u on u.id = a.created_by
     where a.invoice_id = ? order by a.id`,
    id,
  );
  const payments = many<{
    id: number;
    receipt_number: number;
    amount_cents: number;
    method: string;
    paid_on: string;
    voided_at: string | null;
    username: string | null;
  }>(
    db,
    `select p.id, p.receipt_number, p.amount_cents, p.method, p.paid_on, p.voided_at, u.username
     from payments p left join users u on u.id = p.received_by
     where p.invoice_id = ? order by p.id`,
    id,
  );
  const totals = invoiceTotals(db, id);
  const school = schoolOf(db);
  const dates =
    school.pay_schedule === "instalments" && school.billing === "term" ? termDates(db, invoice.term_id) : null;
  const plan = dates
    ? dates.map((date, index) => {
        const due = dueCents(totals.net, dates, date);
        return { date, due, share: index + 1, of: dates.length };
      })
    : null;
  return {
    ...invoice,
    lines,
    adjustments,
    payments,
    totals,
    symbol: symbolOf(db, invoice.currency_code),
    plan,
    position: positionOnSchedule(db, id, todayISO()),
  };
}

function termDates(db: DB, termId: number) {
  const term = one<{ opens_on: string; closes_on: string }>(
    db,
    "select opens_on, closes_on from terms where id = ?",
    termId,
  );
  if (!term) return null;
  return instalmentDates(term.opens_on, term.closes_on);
}

export function debtors(db: DB, filters: { termId?: number; classId?: number; behind?: boolean; asAt?: string }) {
  const term = filters.termId ? terms(db).find((item) => item.id === filters.termId) ?? currentTerm(db) : currentTerm(db);
  const asAt = filters.asAt && filters.asAt <= todayISO() ? filters.asAt : todayISO();
  if (!term) return { term: null, asAt, rows: [], clamped: false };
  const invoices = many<{
    id: number;
    number: string;
    class_name: string;
    class_id: number | null;
    currency_code: string;
    student_id: number;
    student_number: string;
    first_name: string;
    surname: string;
    status: string;
    leave_reason: string | null;
  }>(
    db,
    `select i.id, i.number, i.class_name, i.class_id, i.currency_code, s.id as student_id,
            s.student_number, s.first_name, s.surname, s.status, s.leave_reason
     from invoices i join students s on s.id = i.student_id
     where i.term_id = ?
     order by i.class_name, s.surname, s.first_name`,
    term.id,
  );
  const rows = invoices
    .map((invoice) => {
      const totals = invoiceTotals(db, invoice.id);
      const position = positionOnSchedule(db, invoice.id, asAt);
      return {
        ...invoice,
        ...totals,
        symbol: symbolOf(db, invoice.currency_code),
        due: position?.due ?? totals.net,
        behind: position ? position.behind : totals.owing > 0,
        scheduled: Boolean(position),
      };
    })
    .filter((row) => row.owing > 0)
    .filter((row) => (filters.classId ? row.class_id === filters.classId : true))
    .filter((row) => (filters.behind ? row.behind : true));
  return { term, asAt, rows, clamped: Boolean(filters.asAt && filters.asAt > todayISO()) };
}

export function dailyCash(db: DB, from: string, to: string) {
  const today = todayISO();
  const start = from > today ? today : from;
  const end = to > today ? today : to;
  const payments = many<{
    currency_code: string;
    method: string;
    username: string | null;
    amount_cents: number;
  }>(
    db,
    `select i.currency_code, p.method, u.username, p.amount_cents
     from payments p
     join invoices i on i.id = p.invoice_id
     left join users u on u.id = p.received_by
     where p.voided_at is null and p.paid_on >= ? and p.paid_on <= ?`,
    start,
    end,
  );
  const income = many<{ currency_code: string; method: string; username: string | null; amount_cents: number; category_name: string }>(
    db,
    `select currency_code, method, u.username, amount_cents, category_name
     from other_income o left join users u on u.id = o.recorded_by
     where o.voided_at is null and o.received_on >= ? and o.received_on <= ?`,
    start,
    end,
  );
  return { from: start, to: end, clamped: from > today || to > today, payments, income };
}

export function fundReport(db: DB) {
  const codes = currencies(db);
  const items = feeItems(db);
  const others = many<{ id: number; name: string }>(db, "select id, name from other_categories order by name");
  const fee = items.flatMap((item) =>
    codes.map((currency) => {
      const income =
        one<{ n: number }>(
          db,
          `select coalesce(sum(a.amount_cents),0) as n
           from allocations a
           join payments p on p.id = a.payment_id
           join invoices i on i.id = p.invoice_id
           where a.fee_item_id = ? and i.currency_code = ? and p.voided_at is null`,
          item.id,
          currency.code,
        )?.n ?? 0;
      const spent =
        one<{ n: number }>(
          db,
          `select coalesce(sum(amount_cents),0) as n from expenditure
           where fund_kind='fee' and fund_id=? and currency_code=? and voided_at is null`,
          item.id,
          currency.code,
        )?.n ?? 0;
      return {
        kind: "fee" as const,
        id: item.id,
        name: item.name,
        currency: currency.code,
        symbol: currency.symbol,
        opening: 0,
        income,
        spent,
        closing: income - spent,
      };
    }),
  );
  const other = others.flatMap((item) =>
    codes.map((currency) => {
      const income =
        one<{ n: number }>(
          db,
          `select coalesce(sum(amount_cents),0) as n from other_income
           where category_id=? and currency_code=? and voided_at is null`,
          item.id,
          currency.code,
        )?.n ?? 0;
      const spent =
        one<{ n: number }>(
          db,
          `select coalesce(sum(amount_cents),0) as n from expenditure
           where fund_kind='other' and fund_id=? and currency_code=? and voided_at is null`,
          item.id,
          currency.code,
        )?.n ?? 0;
      return {
        kind: "other" as const,
        id: item.id,
        name: item.name,
        currency: currency.code,
        symbol: currency.symbol,
        opening: 0,
        income,
        spent,
        closing: income - spent,
      };
    }),
  );
  return [...fee, ...other].filter((row) => row.income !== 0 || row.spent !== 0);
}

export function spendableFunds(db: DB) {
  return fundReport(db)
    .filter((row) => row.closing > 0)
    .map((row) => ({
      key: `${row.kind}:${row.id}:${row.currency}`,
      label: `${row.name} · ${formatMoney(row.closing, row.symbol)}`,
      ...row,
    }));
}

export function listPayments(db: DB, from: string, to: string) {
  const today = todayISO();
  const start = from > today ? today : from || "2000-01-01";
  const end = !to || to > today ? today : to;
  return {
    from: start,
    to: end,
    clamped: from > today || to > today,
    rows: many<{
      id: number;
      receipt_number: number;
      amount_cents: number;
      received_cents: number;
      received_currency: string;
      rate: number | null;
      method: string;
      paid_on: string;
      voided_at: string | null;
      void_reason: string | null;
      currency_code: string;
      student_number: string;
      first_name: string;
      surname: string;
      username: string | null;
    }>(
      db,
      `select p.*, i.currency_code, s.student_number, s.first_name, s.surname, u.username
       from payments p
       join invoices i on i.id = p.invoice_id
       join students s on s.id = i.student_id
       left join users u on u.id = p.received_by
       where p.paid_on >= ? and p.paid_on <= ?
       order by p.paid_on desc, p.id desc`,
      start,
      end,
    ),
  };
}

export function getReceipt(db: DB, id: number) {
  const payment = one<{
    id: number;
    invoice_id: number;
    receipt_number: number;
    amount_cents: number;
    received_cents: number;
    received_currency: string;
    rate: number | null;
    method: string;
    paid_on: string;
    note: string;
    voided_at: string | null;
    void_reason: string | null;
    created_at: string;
    username: string | null;
    currency_code: string;
    invoice_number: string;
    term_label: string;
    class_name: string;
    student_id: number;
    student_number: string;
    first_name: string;
    surname: string;
  }>(
    db,
    `select p.*, u.username, i.currency_code, i.number as invoice_number, i.class_name, i.student_id,
            t.label as term_label, s.student_number, s.first_name, s.surname
     from payments p
     join invoices i on i.id = p.invoice_id
     join terms t on t.id = i.term_id
     join students s on s.id = i.student_id
     left join users u on u.id = p.received_by
     where p.id = ?`,
    id,
  );
  if (!payment) return null;
  const allocations = many<{ fee_item_name: string; amount_cents: number }>(
    db,
    "select fee_item_name, amount_cents from allocations where payment_id = ? order by id",
    id,
  );
  const voidedBy = payment.voided_at
    ? one<{ username: string }>(
        db,
        "select u.username from payments p join users u on u.id = p.voided_by where p.id = ?",
        id,
      )?.username
    : null;
  return {
    ...payment,
    allocations,
    symbol: symbolOf(db, payment.currency_code),
    receivedSymbol: symbolOf(db, payment.received_currency),
    voidedBy,
  };
}

export function listExpenditure(db: DB) {
  return many<{
    id: number;
    fund_name: string;
    currency_code: string;
    amount_cents: number;
    description: string;
    spent_on: string;
    voided_at: string | null;
    void_reason: string | null;
    username: string | null;
  }>(
    db,
    `select e.*, u.username from expenditure e
     left join users u on u.id = e.recorded_by
     order by e.spent_on desc, e.id desc`,
  );
}

export function listOtherIncome(db: DB) {
  return many<{
    id: number;
    category_name: string;
    currency_code: string;
    amount_cents: number;
    description: string;
    method: string;
    received_on: string;
    voided_at: string | null;
    void_reason: string | null;
    username: string | null;
  }>(
    db,
    `select o.*, u.username from other_income o
     left join users u on u.id = o.recorded_by
     order by o.received_on desc, o.id desc`,
  );
}

export function otherCategories(db: DB) {
  return many<{ id: number; name: string }>(db, "select id, name from other_categories order by name");
}

export function listUsers(db: DB) {
  return many<{
    id: number;
    username: string;
    role: string;
    must_change_password: number;
    failed_attempts: number;
    locked_until: string | null;
  }>(db, "select id, username, role, must_change_password, failed_attempts, locked_until from users order by username");
}

export function listActivity(db: DB, from: string, to: string) {
  const today = todayISO();
  const start = from > today ? today : from || "2000-01-01";
  const endDay = !to || to > today ? today : to;
  return many<{ id: number; username: string | null; action: string; detail: string; at: string }>(
    db,
    "select id, username, action, detail, at from activity where substr(at,1,10) >= ? and substr(at,1,10) <= ? order by id desc limit 300",
    start,
    endDay,
  );
}

export function closedMonths(db: DB) {
  return many<{ year: number; month: number; closed_at: string }>(
    db,
    "select year, month, closed_at from closed_months order by year desc, month desc",
  );
}

export function structures(db: DB) {
  return many<{
    id: number;
    category_id: number;
    term_id: number;
    currency_code: string;
    category_name: string;
    term_label: string;
  }>(
    db,
    `select s.id, s.category_id, s.term_id, s.currency_code, c.name as category_name, t.label as term_label
     from fee_structures s
     join fee_categories c on c.id = s.category_id
     join terms t on t.id = s.term_id
     order by t.year, t.number, c.name, s.currency_code`,
  );
}

export function structureLines(db: DB, structureId: number) {
  return many<{ fee_item_id: number; amount_cents: number }>(
    db,
    "select fee_item_id, amount_cents from fee_structure_lines where structure_id = ?",
    structureId,
  );
}

export function receiptBooks(db: DB) {
  return many<{
    id: number;
    name: string;
    first_number: number;
    last_number: number;
    next_number: number;
    method: string | null;
    active: number;
  }>(db, "select * from receipt_books order by id");
}

export function rates(db: DB) {
  return many<{ id: number; from_code: string; to_code: string; rate: number; effective_on: string }>(
    db,
    "select * from exchange_rates order by effective_on desc, id desc",
  );
}

export function latestRate(db: DB, from: string, to: string) {
  return one<{ rate: number }>(
    db,
    "select rate from exchange_rates where from_code = ? and to_code = ? order by effective_on desc, id desc limit 1",
    from,
    to,
  )?.rate;
}

export function classList(db: DB, classId: number | "all") {
  const selected = classId === "all" ? classes(db) : classes(db).filter((cls) => cls.id === classId);
  return selected.map((cls) => ({
    ...cls,
    pupils: many<{ student_number: string; surname: string; first_name: string; gender: string; dob: string | null }>(
      db,
      `select student_number, surname, first_name, gender, dob from students
       where class_id = ? and status = 'active' and erased = 0
       order by surname, first_name`,
      cls.id,
    ),
  }));
}

export function promotionPreview(db: DB) {
  const list = classes(db);
  return list.map((cls, index) => {
    const next = list[index + 1];
    return {
      ...cls,
      destination: next ? String(next.id) : "finish",
      pupils: many<{ id: number; student_number: string; surname: string; first_name: string }>(
        db,
        `select id, student_number, surname, first_name from students
         where class_id = ? and status = 'active' and erased = 0
         order by surname, first_name`,
        cls.id,
      ),
    };
  });
}

export function latestPromotion(db: DB) {
  return one<{ id: number; created_at: string; undone_at: string | null }>(
    db,
    "select id, created_at, undone_at from promotions order by id desc limit 1",
  );
}

export function oldRecords(db: DB) {
  const school = getSchool(db);
  const rows = many<{
    id: number;
    student_number: string;
    surname: string;
    first_name: string;
    left_on: string | null;
    leave_reason: string | null;
    erased: number;
  }>(
    db,
    `select id, student_number, surname, first_name, left_on, leave_reason, erased
     from students where status = 'left' order by left_on`,
  );
  return rows.map((row) => ({ ...row, owing: owingOf(db, row.id), retention: school.retention_years }));
}

function owingOf(db: DB, studentId: number) {
  const invoices = many<{ id: number }>(db, "select id from invoices where student_id = ?", studentId);
  return invoices.reduce((sum, invoice) => sum + Math.max(0, invoiceTotals(db, invoice.id).owing), 0);
}

export function userCount(db: DB) {
  return one<{ n: number }>(db, "select count(*) as n from users")?.n ?? 0;
}

export function importBatch(db: DB, id: string) {
  const row = one<{ payload: string }>(db, "select payload from import_batches where id = ?", id);
  if (!row) return null;
  return JSON.parse(row.payload) as {
    rows: {
      row: number;
      surname: string;
      firstName: string;
      gender: string;
      className: string;
      problems: string[];
      duplicate: boolean;
    }[];
    fileName: string;
  };
}

export { fundBalance };
