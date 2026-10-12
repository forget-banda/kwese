import { randomBytes } from "node:crypto";
import type { DB } from "./db";
import { many, one } from "./db";
import { AppError } from "./errors";
import {
  formatMoney,
  lastDayOfMonth,
  methodLabel,
  monthName,
  nowISO,
  parseDob,
  todayISO,
} from "./format";
import { dueCents, fairFee, instalmentDates, splitCents, studentCode, yearsOld } from "./money";
import { hashPassword, temporaryPassword, verifyPassword } from "./password";
import type { Actor } from "./types";

type School = {
  id: number;
  name: string;
  billing: string;
  pay_schedule: string;
  currency_mode: string;
  idle_minutes: number;
  retention_years: number;
};

type InvoiceRow = {
  id: number;
  number: string;
  student_id: number;
  term_id: number;
  currency_code: string;
  class_name: string;
};

export function log(db: DB, actor: Actor | null, action: string, detail: string) {
  db.prepare(
    "insert into activity (user_id, username, action, detail, at) values (?, ?, ?, ?, ?)",
  ).run(actor?.id ?? null, actor?.username ?? null, action, detail, nowISO());
}

export function schoolOf(db: DB) {
  return one<School>(db, "select * from school where id = 1")!;
}

export function symbolOf(db: DB, code: string) {
  return one<{ symbol: string }>(db, "select symbol from currencies where code = ?", code)?.symbol ?? `${code} `;
}

function assertDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new AppError(`Enter a real ${label}.`);
}

export function clampToToday(value: string): { date: string; clamped: boolean } {
  assertDate(value, "date");
  const today = todayISO();
  if (value > today) return { date: today, clamped: true };
  return { date: value, clamped: false };
}

export function assertMonthOpen(db: DB, isoDate: string) {
  const year = Number(isoDate.slice(0, 4));
  const month = Number(isoDate.slice(5, 7));
  const closed = one(db, "select 1 as x from closed_months where year = ? and month = ?", year, month);
  if (closed) {
    throw new AppError(
      `${monthName(month)} ${year} is closed. Nothing can be recorded or voided in it until an admin reopens it.`,
    );
  }
}

export function invoiceTotals(db: DB, invoiceId: number) {
  const gross =
    (one<{ n: number }>(db, "select coalesce(sum(amount_cents),0) as n from invoice_lines where invoice_id = ?", invoiceId)?.n ?? 0);
  const adj =
    (one<{ n: number }>(
      db,
      "select coalesce(sum(amount_cents),0) as n from adjustments where invoice_id = ? and voided_at is null",
      invoiceId,
    )?.n ?? 0);
  const paid =
    (one<{ n: number }>(
      db,
      "select coalesce(sum(amount_cents),0) as n from payments where invoice_id = ? and voided_at is null",
      invoiceId,
    )?.n ?? 0);
  const net = gross + adj;
  return { gross, adj, paid, net, owing: net - paid };
}

export function lineWeights(db: DB, invoiceId: number) {
  return many<{ key: string; name: string; weight: number }>(
    db,
    "select fee_item_id as key, fee_item_name as name, amount_cents as weight from invoice_lines where invoice_id = ? order by id",
    invoiceId,
  ).map((line) => ({ ...line, key: String(line.key) }));
}

function nextStudentNumber(db: DB, firstName: string, surname: string) {
  const row = db.prepare("update student_seq set n = n + 1 where id = 1 returning n").get() as { n: number };
  return studentCode(firstName, surname, row.n);
}

function assertDob(dob: string | null) {
  if (!dob) return;
  if (yearsOld(dob, todayISO()) < 2) {
    throw new AppError("A date of birth has to make the pupil at least 2 years old.");
  }
}

export function addStudent(
  db: DB,
  actor: Actor,
  input: {
    surname: string;
    firstName: string;
    gender: string;
    classId: number;
    categoryId: number;
    currency: string;
    dob: string | null;
    address?: string;
    guardian?: string;
    phone?: string;
    doctor?: string;
    emergency?: string;
    notes?: string;
  },
) {
  const surname = input.surname.trim();
  const firstName = input.firstName.trim();
  if (!surname || !firstName) throw new AppError("Surname and first name are required.");
  if (input.gender !== "Female" && input.gender !== "Male") throw new AppError("Choose Female or Male.");
  assertDob(input.dob);
  const cls = one<{ id: number }>(db, "select id from classes where id = ?", input.classId);
  if (!cls) throw new AppError("Choose a class.");
  const category = one(db, "select id from fee_categories where id = ?", input.categoryId);
  if (!category) throw new AppError("Choose a fee category.");
  const currency = one(db, "select code from currencies where code = ?", input.currency);
  if (!currency) throw new AppError("Choose the currency this pupil is billed in.");
  const number = nextStudentNumber(db, firstName, surname);
  const result = db
    .prepare(
      `insert into students (
        student_number, surname, first_name, gender, class_id, category_id, currency_code, dob,
        address, guardian, phone, doctor, emergency, notes, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      number,
      surname,
      firstName,
      input.gender,
      input.classId,
      input.categoryId,
      input.currency,
      input.dob,
      input.address?.trim() ?? "",
      input.guardian?.trim() ?? "",
      input.phone?.trim() ?? "",
      input.doctor?.trim() ?? "",
      input.emergency?.trim() ?? "",
      input.notes?.trim() ?? "",
      nowISO(),
    );
  log(db, actor, "Student added", `${number} ${firstName} ${surname}`);
  return { id: Number(result.lastInsertRowid), studentNumber: number };
}

export function updateStudent(
  db: DB,
  actor: Actor,
  id: number,
  input: {
    surname: string;
    firstName: string;
    gender: string;
    classId: number;
    categoryId: number;
    currency: string;
    dob: string | null;
    address: string;
    guardian: string;
    phone: string;
    doctor: string;
    emergency: string;
    notes: string;
  },
) {
  const student = one<{ erased: number; student_number: string }>(db, "select * from students where id = ?", id);
  if (!student) throw new AppError("That pupil is not on the register.");
  if (student.erased) throw new AppError("Personal details for this former pupil have been erased.");
  const surname = input.surname.trim();
  const firstName = input.firstName.trim();
  if (!surname || !firstName) throw new AppError("Surname and first name are required.");
  if (input.gender !== "Female" && input.gender !== "Male") throw new AppError("Choose Female or Male.");
  assertDob(input.dob);
  db.prepare(
    `update students set surname=?, first_name=?, gender=?, class_id=?, category_id=?, currency_code=?, dob=?,
      address=?, guardian=?, phone=?, doctor=?, emergency=?, notes=? where id=?`,
  ).run(
    surname,
    firstName,
    input.gender,
    input.classId,
    input.categoryId,
    input.currency,
    input.dob,
    input.address.trim(),
    input.guardian.trim(),
    input.phone.trim(),
    input.doctor.trim(),
    input.emergency.trim(),
    input.notes.trim(),
    id,
  );
  log(db, actor, "Student updated", `${student.student_number} ${firstName} ${surname}`);
}

export function recordLeaving(
  db: DB,
  actor: Actor,
  studentId: number,
  input: { reason: string; leftOn: string; destination: string },
) {
  const student = one<{ status: string; student_number: string; first_name: string; surname: string }>(
    db,
    "select * from students where id = ?",
    studentId,
  );
  if (!student) throw new AppError("That pupil is not on the register.");
  if (student.status !== "active") throw new AppError("This pupil has already left.");
  const { date } = clampToToday(input.leftOn);
  if (!input.reason) throw new AppError("Choose why they are leaving.");
  db.prepare(
    "update students set status='left', left_on=?, leave_reason=?, leave_destination=? where id=?",
  ).run(date, input.reason, input.destination.trim(), studentId);
  log(db, actor, "Student left", `${student.student_number} ${student.first_name} ${student.surname} · ${input.reason}`);
}

export function bringBack(db: DB, actor: Actor, studentId: number) {
  const student = one<{ erased: number; student_number: string; first_name: string; surname: string }>(
    db,
    "select * from students where id = ?",
    studentId,
  );
  if (!student) throw new AppError("That pupil is not on the register.");
  if (student.erased) throw new AppError("Erased personal details cannot be brought back.");
  db.prepare(
    "update students set status='active', left_on=null, leave_reason=null, leave_destination=null where id=?",
  ).run(studentId);
  log(db, actor, "Student returned", `${student.student_number} ${student.first_name} ${student.surname}`);
}

export function eraseStudent(db: DB, actor: Actor, studentId: number) {
  if (actor.role !== "admin") throw new AppError("Only an admin can erase personal details.");
  const student = one<{ student_number: string; erased: number }>(db, "select * from students where id = ?", studentId);
  if (!student) throw new AppError("That pupil is not on the register.");
  if (student.erased) throw new AppError("Those details are already gone.");
  db.prepare(
    `update students set surname='Former Student', first_name='', gender='', dob=null, address='', guardian='',
      phone='', doctor='', emergency='', notes='', erased=1 where id=?`,
  ).run(studentId);
  log(db, actor, "Personal details erased", student.student_number);
}

export function eraseOldRecords(db: DB, actor: Actor) {
  if (actor.role !== "admin") throw new AppError("Only an admin can erase personal details.");
  const school = schoolOf(db);
  const today = todayISO();
  const cutoffYear = Number(today.slice(0, 4)) - school.retention_years;
  const cutoff = `${cutoffYear}${today.slice(4)}`;
  const candidates = many<{ id: number }>(
    db,
    `select s.id from students s
     where s.status='left' and s.erased=0 and s.left_on is not null and s.left_on <= ?`,
    cutoff,
  );
  let erased = 0;
  for (const candidate of candidates) {
    const owing = studentOwing(db, candidate.id);
    if (owing > 0) continue;
    eraseStudent(db, actor, candidate.id);
    erased += 1;
  }
  return erased;
}

export function studentOwing(db: DB, studentId: number) {
  const invoices = many<{ id: number }>(db, "select id from invoices where student_id = ?", studentId);
  return invoices.reduce((sum, invoice) => sum + Math.max(0, invoiceTotals(db, invoice.id).owing), 0);
}

export function generateInvoices(db: DB, actor: Actor, termId: number) {
  const term = one<{ id: number; label: string; year: number; number: number }>(
    db,
    "select * from terms where id = ?",
    termId,
  );
  if (!term) throw new AppError("Choose a term.");
  const students = many<{
    id: number;
    student_number: string;
    first_name: string;
    surname: string;
    class_id: number | null;
    category_id: number | null;
    currency_code: string;
    class_name: string | null;
  }>(
    db,
    `select s.*, c.name as class_name from students s
     left join classes c on c.id = s.class_id
     where s.status = 'active' and s.erased = 0
     order by c.sort_order, s.surname, s.first_name`,
  );
  const created: string[] = [];
  const skipped: { name: string; reason: string }[] = [];
  for (const student of students) {
    const existing = one(db, "select id from invoices where student_id = ? and term_id = ?", student.id, termId);
    if (existing) continue;
    const result = billStudent(db, actor, student, term);
    if (result.invoiceId && result.number) created.push(result.number);
    else skipped.push({ name: `${student.first_name} ${student.surname}`, reason: result.reason ?? "Skipped" });
  }
  log(db, actor, "Invoices generated", `${term.label}: ${created.length} created, ${skipped.length} skipped`);
  return { created, skipped, term };
}

export function createStudentInvoice(db: DB, actor: Actor, studentId: number, termId: number) {
  const student = one<{
    id: number;
    status: string;
    first_name: string;
    surname: string;
    class_id: number | null;
    category_id: number | null;
    currency_code: string;
    class_name: string | null;
  }>(
    db,
    `select s.*, c.name as class_name from students s left join classes c on c.id = s.class_id where s.id = ?`,
    studentId,
  );
  if (!student) throw new AppError("That pupil is not on the register.");
  if (student.status !== "active") throw new AppError("A pupil who has left is not billed for a new period.");
  const before = one<{ id: number }>(db, "select id from invoices where student_id = ? and term_id = ?", studentId, termId);
  if (before) return before.id;
  const term = one<{ id: number; label: string; year: number; number: number }>(db, "select * from terms where id = ?", termId);
  if (!term) throw new AppError("Choose a term.");
  const result = billStudent(db, actor, student, term);
  if (!result.invoiceId) throw new AppError(result.reason ?? "No matching fee structure.");
  log(db, actor, "Invoice created", result.number ?? "");
  return result.invoiceId;
}

function billStudent(
  db: DB,
  actor: Actor,
  student: {
    id: number;
    first_name: string;
    surname: string;
    class_id: number | null;
    category_id: number | null;
    currency_code: string;
    class_name: string | null;
  },
  term: { id: number; year: number; number: number },
): { invoiceId?: number; number?: string; reason?: string } {
  if (!student.category_id) return { reason: "No fee category" };
  const structure = one<{ id: number }>(
    db,
    "select id from fee_structures where category_id = ? and term_id = ? and currency_code = ?",
    student.category_id,
    term.id,
    student.currency_code,
  );
  if (!structure) return { reason: `No ${student.currency_code} fee structure for their category` };
  const lines = many<{ fee_item_id: number; name: string; amount_cents: number }>(
    db,
    `select l.fee_item_id, i.name, l.amount_cents
     from fee_structure_lines l join fee_items i on i.id = l.fee_item_id
     where l.structure_id = ? order by i.sort_order`,
    structure.id,
  );
  if (lines.length === 0 || lines.every((line) => line.amount_cents <= 0)) {
    return { reason: "Fee structure has no amounts" };
  }
  const count = (one<{ n: number }>(db, "select count(*) as n from invoices where term_id = ?", term.id)?.n ?? 0) + 1;
  const number = `INV-${term.year}-${term.number}-${String(count).padStart(4, "0")}`;
  const invoice = db
    .prepare(
      `insert into invoices (number, student_id, term_id, class_id, class_name, currency_code, created_at, created_by)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      number,
      student.id,
      term.id,
      student.class_id,
      student.class_name ?? "No class",
      student.currency_code,
      nowISO(),
      actor.id,
      );
  const insertLine = db.prepare(
    "insert into invoice_lines (invoice_id, fee_item_id, fee_item_name, amount_cents) values (?, ?, ?, ?)",
  );
  for (const line of lines) {
    if (line.amount_cents > 0) insertLine.run(invoice.lastInsertRowid, line.fee_item_id, line.name, line.amount_cents);
  }
  return { invoiceId: Number(invoice.lastInsertRowid), number };
}

export function adjustInvoice(db: DB, actor: Actor, invoiceId: number, reduceCents: number, reason: string) {
  if (actor.role !== "admin") throw new AppError("Only an admin can reduce fees.");
  const invoice = one<InvoiceRow>(db, "select * from invoices where id = ?", invoiceId);
  if (!invoice) throw new AppError("That invoice is not on file.");
  if (!reason.trim()) throw new AppError("Give a reason for the reduction.");
  if (reduceCents <= 0) throw new AppError("Enter how much to take off.");
  const today = todayISO();
  assertMonthOpen(db, today);
  const { owing } = invoiceTotals(db, invoiceId);
  if (reduceCents > owing) {
    throw new AppError(`You can only take off what is still owing (${formatMoney(owing, symbolOf(db, invoice.currency_code))}).`);
  }
  db.prepare(
    "insert into adjustments (invoice_id, amount_cents, reason, created_by, created_at) values (?, ?, ?, ?, ?)",
  ).run(invoiceId, -reduceCents, reason.trim(), actor.id, nowISO());
  log(db, actor, "Fees reduced", `${invoice.number} by ${formatMoney(reduceCents, symbolOf(db, invoice.currency_code))} · ${reason.trim()}`);
}

export function voidAdjustment(db: DB, actor: Actor, adjustmentId: number, reason: string) {
  if (actor.role !== "admin") throw new AppError("Only an admin can void a fee reduction.");
  if (!reason.trim()) throw new AppError("Give a reason.");
  const row = one<{ id: number; invoice_id: number; voided_at: string | null; created_at: string }>(
    db,
    "select * from adjustments where id = ?",
    adjustmentId,
  );
  if (!row) throw new AppError("That reduction is not on file.");
  if (row.voided_at) throw new AppError("That reduction is already voided.");
  assertMonthOpen(db, todayISO());
  db.prepare("update adjustments set voided_at=?, voided_by=?, void_reason=? where id=?").run(
    nowISO(),
    actor.id,
    reason.trim(),
    adjustmentId,
  );
  log(db, actor, "Fee reduction voided", `Adjustment ${adjustmentId}: ${reason.trim()}`);
}

function bookFor(db: DB, method: string) {
  const specific = one<{ id: number; next_number: number; last_number: number; name: string }>(
    db,
    "select * from receipt_books where active = 1 and method = ? order by id limit 1",
    method,
  );
  const book =
    specific ??
    one<{ id: number; next_number: number; last_number: number; name: string }>(
      db,
      "select * from receipt_books where active = 1 and method is null order by id limit 1",
    );
  if (!book) throw new AppError("There is no active receipt book. Add one under Setup → Receipt books.");
  if (book.next_number > book.last_number) {
    throw new AppError(`${book.name} is full (it ends at ${book.last_number}). Add another range.`);
  }
  return book;
}

export function fundBalance(db: DB, kind: "fee" | "other", fundId: number, currency: string) {
  if (kind === "fee") {
    const income =
      one<{ n: number }>(
        db,
        `select coalesce(sum(a.amount_cents),0) as n
         from allocations a
         join payments p on p.id = a.payment_id
         join invoices i on i.id = p.invoice_id
         where a.fee_item_id = ? and i.currency_code = ? and p.voided_at is null`,
        fundId,
        currency,
      )?.n ?? 0;
    const spent =
      one<{ n: number }>(
        db,
        `select coalesce(sum(amount_cents),0) as n from expenditure
         where fund_kind='fee' and fund_id=? and currency_code=? and voided_at is null`,
        fundId,
        currency,
      )?.n ?? 0;
    return income - spent;
  }
  const income =
    one<{ n: number }>(
      db,
      `select coalesce(sum(amount_cents),0) as n from other_income
       where category_id=? and currency_code=? and voided_at is null`,
      fundId,
      currency,
    )?.n ?? 0;
  const spent =
    one<{ n: number }>(
      db,
      `select coalesce(sum(amount_cents),0) as n from expenditure
       where fund_kind='other' and fund_id=? and currency_code=? and voided_at is null`,
      fundId,
      currency,
    )?.n ?? 0;
  return income - spent;
}

export function recordPayment(
  db: DB,
  actor: Actor,
  input: {
    invoiceId: number;
    receivedCents: number;
    receivedCurrency: string;
    rate: number | null;
    method: string;
    paidOn: string;
    note: string;
  },
) {
  const invoice = one<InvoiceRow & { student_id: number }>(db, "select * from invoices where id = ?", input.invoiceId);
  if (!invoice) throw new AppError("That invoice is not on file.");
  if (!["cash", "bank", "ecocash", "telecash", "other"].includes(input.method)) {
    throw new AppError("Choose how the money was paid.");
  }
  if (input.receivedCents <= 0) throw new AppError("Type the amount that was handed over.");
  const clamped = clampToToday(input.paidOn);
  assertMonthOpen(db, clamped.date);
  const school = schoolOf(db);
  let applied = input.receivedCents;
  let rate: number | null = null;
  if (input.receivedCurrency !== invoice.currency_code) {
    if (school.currency_mode !== "blended") {
      throw new AppError(
        `Strict mode only takes ${invoice.currency_code} for this invoice. Switch to blended mode to convert a payment.`,
      );
    }
    if (!input.rate || input.rate <= 0) throw new AppError("Enter the exchange rate you are using.");
    rate = input.rate;
    applied = Math.round(input.receivedCents * rate);
    if (applied <= 0) throw new AppError("That rate converts to nothing on the bill.");
  }
  const { owing } = invoiceTotals(db, invoice.id);
  const symbol = symbolOf(db, invoice.currency_code);
  if (applied > owing) {
    throw new AppError(`The most this invoice can take is ${formatMoney(owing, symbol)}.`);
  }
  const weights = lineWeights(db, invoice.id);
  const split = splitCents(
    applied,
    weights.map((line) => ({ key: line.key, weight: line.weight })),
  );
  const book = bookFor(db, input.method);
  const receiptNumber = book.next_number;
  db.prepare("update receipt_books set next_number = next_number + 1 where id = ?").run(book.id);
  const payment = db
    .prepare(
      `insert into payments (
        invoice_id, receipt_number, receipt_book_id, amount_cents, received_cents, received_currency,
        rate, method, paid_on, note, received_by, created_at
      ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      invoice.id,
      receiptNumber,
      book.id,
      applied,
      input.receivedCents,
      input.receivedCurrency,
      rate,
      input.method,
      clamped.date,
      input.note.trim(),
      actor.id,
      nowISO(),
    );
  const insertAlloc = db.prepare(
    "insert into allocations (payment_id, fee_item_id, fee_item_name, amount_cents) values (?, ?, ?, ?)",
  );
  for (const line of weights) {
    const cents = split.get(line.key) ?? 0;
    if (cents > 0) insertAlloc.run(payment.lastInsertRowid, Number(line.key), line.name, cents);
  }
  const student = one<{ student_number: string; first_name: string; surname: string }>(
    db,
    "select student_number, first_name, surname from students where id = ?",
    invoice.student_id,
  );
  log(
    db,
    actor,
    "Payment recorded",
    `Receipt ${receiptNumber} · ${student?.student_number ?? ""} · ${formatMoney(applied, symbol)} ${methodLabel(input.method)}`,
  );
  return {
    id: Number(payment.lastInsertRowid),
    notice: clamped.clamped ? "That date was after today, so today's date was used." : "",
  };
}

export function voidPayment(db: DB, actor: Actor, paymentId: number, reason: string) {
  if (actor.role === "general") throw new AppError("You cannot void a receipt.");
  if (!reason.trim()) throw new AppError("Give a reason for voiding the receipt.");
  const payment = one<{
    id: number;
    voided_at: string | null;
    paid_on: string;
    receipt_number: number;
    invoice_id: number;
  }>(db, "select * from payments where id = ?", paymentId);
  if (!payment) throw new AppError("That receipt is not on file.");
  if (payment.voided_at) throw new AppError("That receipt is already voided.");
  assertMonthOpen(db, payment.paid_on);
  const invoice = one<{ currency_code: string }>(db, "select currency_code from invoices where id = ?", payment.invoice_id);
  const allocations = many<{ fee_item_id: number; fee_item_name: string; amount_cents: number }>(
    db,
    "select * from allocations where payment_id = ?",
    paymentId,
  );
  for (const allocation of allocations) {
    const balance = fundBalance(db, "fee", allocation.fee_item_id, invoice?.currency_code ?? "");
    if (balance - allocation.amount_cents < 0) {
      throw new AppError(
        `Some of this receipt has already been spent from ${allocation.fee_item_name}. Void that expenditure first. A fund cannot go below zero.`,
      );
    }
  }
  db.prepare("update payments set voided_at=?, voided_by=?, void_reason=? where id=?").run(
    nowISO(),
    actor.id,
    reason.trim(),
    paymentId,
  );
  log(db, actor, "Receipt voided", `Receipt ${payment.receipt_number}: ${reason.trim()}`);
}

export function recordExpenditure(
  db: DB,
  actor: Actor,
  input: { fundKey: string; amountCents: number; description: string; spentOn: string },
) {
  if (actor.role === "general") throw new AppError("You cannot record expenditure.");
  const [kind, idText, currency] = input.fundKey.split(":");
  if ((kind !== "fee" && kind !== "other") || !idText || !currency) throw new AppError("Choose a fund.");
  const fundId = Number(idText);
  if (input.amountCents <= 0) throw new AppError("Enter how much was spent.");
  if (!input.description.trim()) throw new AppError("Say what the money was spent on.");
  const clamped = clampToToday(input.spentOn);
  assertMonthOpen(db, clamped.date);
  const balance = fundBalance(db, kind, fundId, currency);
  if (input.amountCents > balance) {
    throw new AppError(
      `That fund only has ${formatMoney(balance, symbolOf(db, currency))} available in ${currency}.`,
    );
  }
  const name =
    kind === "fee"
      ? one<{ name: string }>(db, "select name from fee_items where id = ?", fundId)?.name
      : one<{ name: string }>(db, "select name from other_categories where id = ?", fundId)?.name;
  if (!name) throw new AppError("That fund is not on file.");
  db.prepare(
    `insert into expenditure (fund_kind, fund_id, fund_name, currency_code, amount_cents, description, spent_on, recorded_by, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(kind, fundId, name, currency, input.amountCents, input.description.trim(), clamped.date, actor.id, nowISO());
  log(db, actor, "Expenditure", `${name} ${formatMoney(input.amountCents, symbolOf(db, currency))} · ${input.description.trim()}`);
  return clamped.clamped ? "That date was after today, so today's date was used." : "";
}

export function voidExpenditure(db: DB, actor: Actor, id: number, reason: string) {
  if (actor.role === "general") throw new AppError("You cannot void expenditure.");
  if (!reason.trim()) throw new AppError("Give a reason.");
  const row = one<{ voided_at: string | null; spent_on: string; fund_name: string }>(
    db,
    "select * from expenditure where id = ?",
    id,
  );
  if (!row) throw new AppError("That expenditure is not on file.");
  if (row.voided_at) throw new AppError("That expenditure is already voided.");
  assertMonthOpen(db, row.spent_on);
  db.prepare("update expenditure set voided_at=?, voided_by=?, void_reason=? where id=?").run(
    nowISO(),
    actor.id,
    reason.trim(),
    id,
  );
  log(db, actor, "Expenditure voided", `${row.fund_name}: ${reason.trim()}`);
}

export function addOtherCategory(db: DB, actor: Actor, name: string) {
  const clean = name.trim();
  if (!clean) throw new AppError("Name the kind of income.");
  const existing = one<{ id: number }>(db, "select id from other_categories where lower(name)=lower(?)", clean);
  if (existing) return existing.id;
  const result = db.prepare("insert into other_categories (name) values (?)").run(clean);
  log(db, actor, "Other income category", clean);
  return Number(result.lastInsertRowid);
}

export function recordOtherIncome(
  db: DB,
  actor: Actor,
  input: {
    categoryId: number;
    newCategory: string;
    currency: string;
    amountCents: number;
    description: string;
    method: string;
    receivedOn: string;
  },
) {
  if (actor.role === "general") throw new AppError("You cannot record other income.");
  let categoryId = input.categoryId;
  if (input.newCategory.trim()) categoryId = addOtherCategory(db, actor, input.newCategory);
  const category = one<{ name: string }>(db, "select name from other_categories where id = ?", categoryId);
  if (!category) throw new AppError("Choose a category, or add one.");
  if (input.amountCents <= 0) throw new AppError("Enter the amount received.");
  const currency = one(db, "select code from currencies where code = ?", input.currency);
  if (!currency) throw new AppError("Choose a currency.");
  if (!["cash", "bank", "ecocash", "telecash", "other"].includes(input.method)) {
    throw new AppError("Choose how it was received.");
  }
  const clamped = clampToToday(input.receivedOn);
  assertMonthOpen(db, clamped.date);
  db.prepare(
    `insert into other_income (category_id, category_name, currency_code, amount_cents, description, method, received_on, recorded_by, created_at)
     values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    categoryId,
    category.name,
    input.currency,
    input.amountCents,
    input.description.trim(),
    input.method,
    clamped.date,
    actor.id,
    nowISO(),
  );
  log(
    db,
    actor,
    "Other income",
    `${category.name} ${formatMoney(input.amountCents, symbolOf(db, input.currency))}`,
  );
  return clamped.clamped ? "That date was after today, so today's date was used." : "";
}

export function voidOtherIncome(db: DB, actor: Actor, id: number, reason: string) {
  if (actor.role === "general") throw new AppError("You cannot void other income.");
  if (!reason.trim()) throw new AppError("Give a reason.");
  const row = one<{ voided_at: string | null; received_on: string; category_id: number; currency_code: string; amount_cents: number; category_name: string }>(
    db,
    "select * from other_income where id = ?",
    id,
  );
  if (!row) throw new AppError("That income is not on file.");
  if (row.voided_at) throw new AppError("That income is already voided.");
  assertMonthOpen(db, row.received_on);
  const balance = fundBalance(db, "other", row.category_id, row.currency_code);
  if (balance - row.amount_cents < 0) {
    throw new AppError(
      `Some of this ${row.category_name} money has already been spent. Void that expenditure first.`,
    );
  }
  db.prepare("update other_income set voided_at=?, voided_by=?, void_reason=? where id=?").run(
    nowISO(),
    actor.id,
    reason.trim(),
    id,
  );
  log(db, actor, "Other income voided", `${row.category_name}: ${reason.trim()}`);
}

export function closeMonth(db: DB, actor: Actor, year: number, month: number) {
  if (actor.role === "general") throw new AppError("You cannot close a month.");
  if (month < 1 || month > 12) throw new AppError("Choose a month.");
  const today = todayISO();
  const monthEnd = `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfMonth(year, month)).padStart(2, "0")}`;
  if (monthEnd > today) throw new AppError("You cannot close a month that has not finished.");
  db.prepare(
    "insert into closed_months (year, month, closed_at, closed_by) values (?, ?, ?, ?) on conflict do nothing",
  ).run(year, month, nowISO(), actor.id);
  log(db, actor, "Month closed", `${monthName(month)} ${year}`);
}

export function reopenMonth(db: DB, actor: Actor, year: number, month: number) {
  if (actor.role !== "admin") throw new AppError("Only an admin can reopen a month.");
  db.prepare("delete from closed_months where year = ? and month = ?").run(year, month);
  log(db, actor, "Month reopened", `${monthName(month)} ${year}`);
}

export function setCurrencyMode(db: DB, actor: Actor, mode: string) {
  if (actor.role !== "admin") throw new AppError("Only an admin can change currency mode.");
  if (mode !== "strict" && mode !== "blended") throw new AppError("Choose strict or blended.");
  db.prepare("update school set currency_mode = ? where id = 1").run(mode);
  log(db, actor, "Currency mode", mode);
}

export function saveSchool(
  db: DB,
  actor: Actor,
  input: {
    name: string;
    address: string;
    phone: string;
    email: string;
    billing: string;
    paySchedule: string;
    retentionYears: number;
    idleMinutes: number;
  },
) {
  if (actor.role !== "admin") throw new AppError("Only an admin can change school details.");
  const name = input.name.trim();
  if (!name) throw new AppError("The school name is printed on every receipt.");
  if (input.billing !== "term" && input.billing !== "month") throw new AppError("Choose term or month billing.");
  if (input.paySchedule !== "term" && input.paySchedule !== "instalments") {
    throw new AppError("Choose how parents pay.");
  }
  if (input.idleMinutes < 1 || input.idleMinutes > 60) throw new AppError("Sign-out timing is between 1 and 60 minutes.");
  if (input.retentionYears < 1 || input.retentionYears > 30) throw new AppError("Keep former pupils' details for 1 to 30 years.");
  db.prepare(
    `update school set name=?, address=?, phone=?, email=?, billing=?, pay_schedule=?, retention_years=?, idle_minutes=? where id=1`,
  ).run(
    name,
    input.address.trim(),
    input.phone.trim(),
    input.email.trim(),
    input.billing,
    input.paySchedule,
    input.retentionYears,
    input.idleMinutes,
  );
  log(db, actor, "School details", name);
}

export function setLogo(db: DB, actor: Actor, logoPath: string | null) {
  if (actor.role !== "admin") throw new AppError("Only an admin can change the logo.");
  db.prepare("update school set logo_path = ? where id = 1").run(logoPath);
  log(db, actor, "School logo", logoPath ? "Uploaded" : "Removed");
}

export function dismissSample(db: DB, actor: Actor) {
  if (actor.role !== "admin") throw new AppError("Only an admin can dismiss this.");
  db.prepare("update school set hide_sample_banner = 1 where id = 1").run();
  log(db, actor, "Sample banner", "Dismissed");
}

export function addTerm(
  db: DB,
  actor: Actor,
  input: { year: number; number: number; label: string; opens: string; closes: string; current: boolean; kind: string },
) {
  if (actor.role !== "admin") throw new AppError("Only an admin can add a term.");
  assertDate(input.opens, "opening date");
  assertDate(input.closes, "closing date");
  if (input.closes < input.opens) throw new AppError("The closing date has to be after the opening date.");
  const label = input.label.trim() || (input.kind === "month" ? `${monthName(input.number)} ${input.year}` : `Term ${input.number}`);
  if (input.current) db.prepare("update terms set is_current = 0").run();
  db.prepare(
    `insert into terms (year, number, label, opens_on, closes_on, is_current, kind) values (?, ?, ?, ?, ?, ?, ?)`,
  ).run(input.year, input.number, label, input.opens, input.closes, input.current ? 1 : 0, input.kind);
  log(db, actor, "Term added", label);
}

export function setCurrentTerm(db: DB, actor: Actor, termId: number) {
  if (actor.role !== "admin") throw new AppError("Only an admin can change the current term.");
  db.prepare("update terms set is_current = 0").run();
  db.prepare("update terms set is_current = 1 where id = ?").run(termId);
  log(db, actor, "Current term", String(termId));
}

export function addYearOfMonths(db: DB, actor: Actor, year: number) {
  if (actor.role !== "admin") throw new AppError("Only an admin can add months.");
  if (year < 2000 || year > 2100) throw new AppError("Enter a sensible year.");
  for (let month = 1; month <= 12; month++) {
    const existing = one(db, "select id from terms where year=? and number=? and kind='month'", year, month);
    if (existing) continue;
    const opens = `${year}-${String(month).padStart(2, "0")}-01`;
    const closes = `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfMonth(year, month)).padStart(2, "0")}`;
    db.prepare(
      "insert into terms (year, number, label, opens_on, closes_on, is_current, kind) values (?, ?, ?, ?, ?, 0, 'month')",
    ).run(year, month, `${monthName(month)} ${year}`, opens, closes);
  }
  const current = one(db, "select id from terms where is_current = 1");
  if (!current) {
    const today = todayISO();
    const match = one<{ id: number }>(
      db,
      "select id from terms where kind='month' and opens_on <= ? and closes_on >= ?",
      today,
      today,
    );
    if (match) db.prepare("update terms set is_current = 1 where id = ?").run(match.id);
  }
  log(db, actor, "Months added", String(year));
}

export function addClass(db: DB, actor: Actor, name: string, sortOrder: number) {
  if (actor.role !== "admin") throw new AppError("Only an admin can add a class.");
  if (!name.trim()) throw new AppError("Name the class.");
  db.prepare("insert into classes (name, sort_order) values (?, ?)").run(name.trim(), sortOrder);
  log(db, actor, "Class added", name.trim());
}

export function updateClass(db: DB, actor: Actor, id: number, name: string, sortOrder: number) {
  if (actor.role !== "admin") throw new AppError("Only an admin can edit a class.");
  if (!name.trim()) throw new AppError("Name the class.");
  db.prepare("update classes set name=?, sort_order=? where id=?").run(name.trim(), sortOrder, id);
  log(db, actor, "Class updated", name.trim());
}

export function addCategory(db: DB, actor: Actor, name: string) {
  if (actor.role !== "admin") throw new AppError("Only an admin can add a fee category.");
  if (!name.trim()) throw new AppError("Name the category.");
  db.prepare("insert into fee_categories (name) values (?)").run(name.trim());
  log(db, actor, "Fee category", name.trim());
}

export function addFeeItem(db: DB, actor: Actor, name: string) {
  if (actor.role !== "admin") throw new AppError("Only an admin can add a fee item.");
  if (!name.trim()) throw new AppError("Name the fee item.");
  const sort = (one<{ n: number }>(db, "select coalesce(max(sort_order),0) as n from fee_items")?.n ?? 0) + 1;
  db.prepare("insert into fee_items (name, sort_order) values (?, ?)").run(name.trim(), sort);
  log(db, actor, "Fee item", name.trim());
}

export function saveStructure(
  db: DB,
  actor: Actor,
  input: { categoryId: number; termId: number; currency: string; amounts: { itemId: number; cents: number }[] },
) {
  if (actor.role !== "admin") throw new AppError("Only an admin can set fees.");
  if (input.amounts.every((line) => line.cents <= 0)) throw new AppError("Enter at least one fee amount.");
  const existing = one<{ id: number }>(
    db,
    "select id from fee_structures where category_id=? and term_id=? and currency_code=?",
    input.categoryId,
    input.termId,
    input.currency,
  );
  let structureId = existing?.id;
  if (!structureId) {
    const inserted = db
      .prepare("insert into fee_structures (category_id, term_id, currency_code) values (?, ?, ?)")
      .run(input.categoryId, input.termId, input.currency);
    structureId = Number(inserted.lastInsertRowid);
  }
  db.prepare("delete from fee_structure_lines where structure_id = ?").run(structureId);
  const insert = db.prepare(
    "insert into fee_structure_lines (structure_id, fee_item_id, amount_cents) values (?, ?, ?)",
  );
  for (const line of input.amounts) {
    if (line.cents > 0) insert.run(structureId, line.itemId, line.cents);
  }
  log(db, actor, "Fee structure", `${input.currency} structure saved`);
}

export function copyStructures(db: DB, actor: Actor, fromTermId: number, toTermIds: number[]) {
  if (actor.role !== "admin") throw new AppError("Only an admin can copy fees.");
  const sources = many<{ id: number; category_id: number; currency_code: string }>(
    db,
    "select * from fee_structures where term_id = ?",
    fromTermId,
  );
  let copied = 0;
  for (const termId of toTermIds) {
    if (termId === fromTermId) continue;
    for (const source of sources) {
      const existing = one(
        db,
        "select id from fee_structures where category_id=? and term_id=? and currency_code=?",
        source.category_id,
        termId,
        source.currency_code,
      );
      if (existing) continue;
      const inserted = db
        .prepare("insert into fee_structures (category_id, term_id, currency_code) values (?, ?, ?)")
        .run(source.category_id, termId, source.currency_code);
      const lines = many<{ fee_item_id: number; amount_cents: number }>(
        db,
        "select fee_item_id, amount_cents from fee_structure_lines where structure_id = ?",
        source.id,
      );
      const insert = db.prepare(
        "insert into fee_structure_lines (structure_id, fee_item_id, amount_cents) values (?, ?, ?)",
      );
      for (const line of lines) insert.run(inserted.lastInsertRowid, line.fee_item_id, line.amount_cents);
      copied += 1;
    }
  }
  log(db, actor, "Fees copied", `${copied} structures`);
  return copied;
}

export function addReceiptBook(
  db: DB,
  actor: Actor,
  input: { name: string; first: number; last: number; next: number | null; method: string },
) {
  if (actor.role !== "admin") throw new AppError("Only an admin can add a receipt book.");
  if (input.last <= input.first) throw new AppError("The last number has to be higher than the first.");
  const next = input.next ?? input.first;
  if (next < input.first || next > input.last) throw new AppError("The next number has to lie inside the range.");
  const method = input.method.trim() ? input.method : null;
  db.prepare(
    "insert into receipt_books (name, first_number, last_number, next_number, method, active) values (?, ?, ?, ?, ?, 1)",
  ).run(input.name.trim() || "Receipt book", input.first, input.last, next, method);
  log(db, actor, "Receipt book", input.name.trim() || "Receipt book");
}

export function addCurrency(db: DB, actor: Actor, code: string, symbol: string, makeDefault: boolean) {
  if (actor.role !== "admin") throw new AppError("Only an admin can add a currency.");
  const clean = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(clean)) throw new AppError("Use a 3-letter code, such as USD or ZIG.");
  if (!symbol.trim()) throw new AppError("Give the symbol printed on receipts.");
  if (makeDefault) db.prepare("update currencies set is_default = 0").run();
  const sort = (one<{ n: number }>(db, "select coalesce(max(sort_order),0) as n from currencies")?.n ?? 0) + 1;
  const any = one(db, "select code from currencies limit 1");
  db.prepare("insert into currencies (code, symbol, is_default, sort_order) values (?, ?, ?, ?)").run(
    clean,
    symbol.trim(),
    makeDefault || !any ? 1 : 0,
    sort,
  );
  log(db, actor, "Currency", clean);
}

export function addRate(db: DB, actor: Actor, from: string, to: string, rate: number, effectiveOn: string) {
  if (actor.role !== "admin") throw new AppError("Only an admin can add an exchange rate.");
  if (from === to) throw new AppError("The two currencies have to be different.");
  if (!(rate > 0)) throw new AppError("The rate has to be greater than zero.");
  assertDate(effectiveOn, "date");
  db.prepare(
    "insert into exchange_rates (from_code, to_code, rate, effective_on, created_at) values (?, ?, ?, ?, ?)",
  ).run(from, to, rate, effectiveOn, nowISO());
  log(db, actor, "Exchange rate", `1 ${from} = ${rate} ${to}`);
}

export function addUser(db: DB, actor: Actor, username: string, role: string) {
  if (actor.role !== "admin") throw new AppError("Only an admin can add a user.");
  const name = username.trim().toLowerCase();
  if (!/^[a-z][a-z0-9._-]{2,30}$/.test(name)) {
    throw new AppError("Usernames start with a letter and are at least 3 characters.");
  }
  if (!["admin", "bursar", "general"].includes(role)) throw new AppError("Choose a role.");
  const password = temporaryPassword();
  db.prepare(
    "insert into users (username, password_hash, role, must_change_password, created_at) values (?, ?, ?, 1, ?)",
  ).run(name, hashPassword(password), role, nowISO());
  log(db, actor, "User added", `${name} (${role})`);
  return password;
}

export function resetUserPassword(db: DB, actor: Actor, userId: number) {
  if (actor.role !== "admin") throw new AppError("Only an admin can reset a password.");
  const user = one<{ username: string }>(db, "select username from users where id = ?", userId);
  if (!user) throw new AppError("That user is not on file.");
  const password = temporaryPassword();
  db.prepare(
    "update users set password_hash=?, must_change_password=1, failed_attempts=0, locked_until=null where id=?",
  ).run(hashPassword(password), userId);
  db.prepare("delete from sessions where user_id = ?").run(userId);
  log(db, actor, "Password reset", user.username);
  return { username: user.username, password };
}

export function unlockUser(db: DB, actor: Actor, userId: number) {
  if (actor.role !== "admin") throw new AppError("Only an admin can unlock a user.");
  db.prepare("update users set failed_attempts=0, locked_until=null where id=?").run(userId);
  const user = one<{ username: string }>(db, "select username from users where id = ?", userId);
  log(db, actor, "User unlocked", user?.username ?? String(userId));
}

export function changeOwnPassword(db: DB, actor: Actor, current: string, next: string) {
  const user = one<{ password_hash: string; must_change_password: number }>(
    db,
    "select * from users where id = ?",
    actor.id,
  );
  if (!user) throw new AppError("Sign in again.");
  if (!user.must_change_password && !verifyPassword(current, user.password_hash)) {
    throw new AppError("The current password is wrong.");
  }
  if (next.length < 8) throw new AppError("Use at least 8 characters.");
  db.prepare("update users set password_hash=?, must_change_password=0 where id=?").run(hashPassword(next), actor.id);
  log(db, actor, "Password changed", actor.username);
}

export function createFirstAdmin(
  db: DB,
  input: { school: string; address: string; phone: string; email: string; username: string; password: string },
) {
  const existing = one(db, "select id from users limit 1");
  if (existing) throw new AppError("This desk already has an admin.");
  const school = input.school.trim();
  const username = input.username.trim().toLowerCase();
  if (!school) throw new AppError("Type the school name as it should appear on receipts.");
  if (!/^[a-z][a-z0-9._-]{2,30}$/.test(username)) {
    throw new AppError("The admin username starts with a letter and is at least 3 characters.");
  }
  if (input.password.length < 8) throw new AppError("Use at least 8 characters for the password.");
  db.prepare("update school set name=?, address=?, phone=?, email=?, is_sample=0 where id=1").run(
    school,
    input.address.trim(),
    input.phone.trim(),
    input.email.trim(),
  );
  db.prepare("insert into currencies (code, symbol, is_default, sort_order) values ('USD', '$', 1, 1)").run();
  const result = db
    .prepare(
      "insert into users (username, password_hash, role, must_change_password, created_at) values (?, ?, 'admin', 0, ?)",
    )
    .run(username, hashPassword(input.password), nowISO());
  const actor: Actor = { id: Number(result.lastInsertRowid), username, role: "admin" };
  log(db, actor, "Desk created", school);
  return actor;
}

export function promoteYear(
  db: DB,
  actor: Actor,
  input: { destinationByClass: Record<number, string>; repeating: number[] },
) {
  if (actor.role === "general") throw new AppError("Only the bursar or an admin can promote.");
  const classes = many<{ id: number; name: string; sort_order: number }>(
    db,
    "select * from classes order by sort_order, name",
  );
  const students = many<{ id: number; class_id: number; status: string }>(
    db,
    "select id, class_id, status from students where status='active' and erased=0 and class_id is not null",
  );
  const repeating = new Set(input.repeating);
  const today = todayISO();
  const plan: {
    id: number;
    fromClass: number;
    toClass: number | null;
    finished: boolean;
  }[] = [];
  for (const student of students) {
    if (repeating.has(student.id)) continue;
    const dest = input.destinationByClass[student.class_id];
    if (!dest) continue;
    if (dest === "finish") {
      db.prepare(
        "update students set status='left', left_on=?, leave_reason='completed', leave_destination='' where id=?",
      ).run(today, student.id);
      plan.push({ id: student.id, fromClass: student.class_id, toClass: null, finished: true });
    } else {
      const toClass = Number(dest);
      if (!classes.some((cls) => cls.id === toClass)) throw new AppError("A destination class is missing.");
      db.prepare("update students set class_id=? where id=?").run(toClass, student.id);
      plan.push({ id: student.id, fromClass: student.class_id, toClass, finished: false });
    }
  }
  db.prepare("insert into promotions (created_at, created_by, plan_json) values (?, ?, ?)").run(
    nowISO(),
    actor.id,
    JSON.stringify({ on: today, students: plan }),
  );
  log(db, actor, "Promotion", `${plan.length} pupils moved`);
  return plan.length;
}

export function undoPromotion(db: DB, actor: Actor) {
  if (actor.role === "general") throw new AppError("Only the bursar or an admin can undo a promotion.");
  const promo = one<{ id: number; plan_json: string; undone_at: string | null }>(
    db,
    "select * from promotions where undone_at is null order by id desc limit 1",
  );
  if (!promo) throw new AppError("There is no promotion to undo.");
  const plan = JSON.parse(promo.plan_json) as {
    on: string;
    students: { id: number; fromClass: number; toClass: number | null; finished: boolean }[];
  };
  let undone = 0;
  let left = 0;
  for (const move of plan.students) {
    const student = one<{ class_id: number; status: string; left_on: string | null; leave_reason: string | null }>(
      db,
      "select class_id, status, left_on, leave_reason from students where id = ?",
      move.id,
    );
    if (!student) continue;
    const unchanged = move.finished
      ? student.status === "left" && student.leave_reason === "completed" && student.left_on === plan.on && student.class_id === move.fromClass
      : student.status === "active" && student.class_id === move.toClass;
    if (!unchanged) {
      left += 1;
      continue;
    }
    if (move.finished) {
      db.prepare(
        "update students set status='active', left_on=null, leave_reason=null, leave_destination=null, class_id=? where id=?",
      ).run(move.fromClass, move.id);
    } else {
      db.prepare("update students set class_id=? where id=?").run(move.fromClass, move.id);
    }
    undone += 1;
  }
  db.prepare("update promotions set undone_at=? where id=?").run(nowISO(), promo.id);
  log(db, actor, "Promotion undone", `${undone} reverted, ${left} left as they are`);
  return { undone, left };
}

export type ImportRow = {
  row: number;
  surname: string;
  firstName: string;
  gender: string;
  className: string;
  categoryName: string;
  currency: string;
  dob: string | null;
  address: string;
  guardian: string;
  phone: string;
  doctor: string;
  emergency: string;
  notes: string;
  problems: string[];
  duplicate: boolean;
};

export function previewImport(
  db: DB,
  rows: Omit<ImportRow, "problems" | "duplicate">[],
  defaults: { categoryName: string; className: string },
) {
  const classes = many<{ id: number; name: string }>(db, "select id, name from classes");
  const categories = many<{ id: number; name: string }>(db, "select id, name from fee_categories");
  const currencies = many<{ code: string }>(db, "select code from currencies");
  const classByName = new Map(classes.map((cls) => [cls.name.toLowerCase(), cls]));
  const categoryByName = new Map(categories.map((category) => [category.name.toLowerCase(), category]));
  const seen = new Set<string>();
  return rows.map((row) => {
    const problems: string[] = [];
    const surname = row.surname.trim();
    const firstName = row.firstName.trim();
    if (!surname) problems.push("Surname is missing");
    if (!firstName) problems.push("First name is missing");
    let gender = row.gender.trim();
    if (/^f(emale)?$/i.test(gender)) gender = "Female";
    else if (/^m(ale)?$/i.test(gender)) gender = "Male";
    else problems.push("Gender must be Female or Male");
    const className = row.className.trim() || defaults.className;
    const cls = classByName.get(className.toLowerCase());
    if (!cls) problems.push(className ? `Unknown class “${className}”` : "Class is missing");
    const categoryName = row.categoryName.trim() || defaults.categoryName;
    const category = categoryByName.get(categoryName.toLowerCase());
    if (!category) problems.push(categoryName ? `Unknown fee category “${categoryName}”` : "Choose a fee category for rows that leave it blank");
    const currency = (row.currency.trim() || currencies.find((item) => item)?.code || "").toUpperCase();
    if (!currencies.some((item) => item.code === currency)) problems.push("Currency is missing or unknown");
    let dob: string | null = null;
    if (row.dob) {
      dob = parseDob(row.dob);
      if (!dob) problems.push("Date of birth must be DD/MM/YYYY");
      else if (yearsOld(dob, todayISO()) < 2) problems.push("Date of birth makes the pupil younger than 2");
    }
    const key = `${surname.toLowerCase()}|${firstName.toLowerCase()}|${dob ?? ""}|${cls?.id ?? ""}`;
    let duplicate = false;
    if (surname && firstName && cls && problems.length === 0) {
      if (seen.has(key)) {
        duplicate = true;
        problems.push("Repeated in this sheet");
      }
      seen.add(key);
      const existing = dob
        ? one(
            db,
            "select id from students where lower(surname)=lower(?) and lower(first_name)=lower(?) and dob=?",
            surname,
            firstName,
            dob,
          )
        : one(
            db,
            "select id from students where lower(surname)=lower(?) and lower(first_name)=lower(?) and dob is null and class_id=?",
            surname,
            firstName,
            cls.id,
          );
      if (existing) {
        duplicate = true;
        problems.push("Already on the register");
      }
    }
    return {
      ...row,
      surname,
      firstName,
      gender,
      className,
      categoryName,
      currency,
      dob: dob ?? (row.dob ? row.dob : null),
      problems,
      duplicate,
    } satisfies ImportRow;
  });
}

export function commitImport(db: DB, actor: Actor, batchId: string) {
  const batch = one<{ payload: string }>(db, "select payload from import_batches where id = ?", batchId);
  if (!batch) throw new AppError("That check has expired. Check the sheets again.");
  const payload = JSON.parse(batch.payload) as { rows: ImportRow[]; defaults: { categoryName: string; className: string } };
  const fresh = previewImport(db, payload.rows, payload.defaults);
  const classes = many<{ id: number; name: string; sort_order: number }>(db, "select * from classes");
  const categories = many<{ id: number; name: string }>(db, "select id, name from fee_categories");
  const ready = fresh.filter((row) => row.problems.length === 0);
  ready.sort((a, b) => {
    const classA = classes.find((cls) => cls.name.toLowerCase() === (a.className || payload.defaults.className).toLowerCase());
    const classB = classes.find((cls) => cls.name.toLowerCase() === (b.className || payload.defaults.className).toLowerCase());
    return (
      (classA?.sort_order ?? 0) - (classB?.sort_order ?? 0) ||
      a.surname.localeCompare(b.surname) ||
      a.firstName.localeCompare(b.firstName)
    );
  });
  const added: string[] = [];
  for (const row of ready) {
    const className = row.className || payload.defaults.className;
    const categoryName = row.categoryName || payload.defaults.categoryName;
    const cls = classes.find((item) => item.name.toLowerCase() === className.toLowerCase());
    const category = categories.find((item) => item.name.toLowerCase() === categoryName.toLowerCase());
    if (!cls || !category) continue;
    const created = addStudent(db, actor, {
      surname: row.surname,
      firstName: row.firstName,
      gender: row.gender,
      classId: cls.id,
      categoryId: category.id,
      currency: row.currency,
      dob: row.dob,
      address: row.address,
      guardian: row.guardian,
      phone: row.phone,
      doctor: row.doctor,
      emergency: row.emergency,
      notes: row.notes,
    });
    added.push(created.studentNumber);
  }
  db.prepare("delete from import_batches where id = ?").run(batchId);
  return { added: added.length, skipped: fresh.length - ready.length };
}

export function saveImportBatch(db: DB, actor: Actor, payload: unknown) {
  const id = randomBytes(12).toString("hex");
  db.prepare("insert into import_batches (id, created_by, payload, created_at) values (?, ?, ?, ?)").run(
    id,
    actor.id,
    JSON.stringify(payload),
    nowISO(),
  );
  return id;
}

export function partTermSuggestion(db: DB, studentId: number) {
  const student = one<{ left_on: string | null; status: string }>(db, "select left_on, status from students where id = ?", studentId);
  if (!student?.left_on) return null;
  const invoice = one<{ id: number; currency_code: string; term_id: number; number: string }>(
    db,
    `select i.* from invoices i
     join terms t on t.id = i.term_id
     where i.student_id = ? and t.opens_on <= ? and t.closes_on >= ?
     order by t.opens_on desc limit 1`,
    studentId,
    student.left_on,
    student.left_on,
  );
  if (!invoice) return null;
  const term = one<{ opens_on: string; closes_on: string; label: string }>(db, "select * from terms where id = ?", invoice.term_id);
  if (!term) return null;
  const totals = invoiceTotals(db, invoice.id);
  const fair = fairFee(totals.net, term.opens_on, term.closes_on, student.left_on);
  const reduction = Math.max(0, Math.min(totals.owing, totals.net - fair));
  return {
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    currency: invoice.currency_code,
    symbol: symbolOf(db, invoice.currency_code),
    fair,
    reduction,
    term: term.label,
    owing: totals.owing,
  };
}

export function scheduleForTerm(db: DB, termId: number) {
  const school = schoolOf(db);
  const term = one<{ opens_on: string; closes_on: string }>(db, "select opens_on, closes_on from terms where id = ?", termId);
  if (!term || school.pay_schedule !== "instalments" || school.billing !== "term") return null;
  return instalmentDates(term.opens_on, term.closes_on);
}

export function positionOnSchedule(db: DB, invoiceId: number, asAt: string) {
  const invoice = one<{ term_id: number }>(db, "select term_id from invoices where id = ?", invoiceId);
  if (!invoice) return null;
  const dates = scheduleForTerm(db, invoice.term_id);
  if (!dates) return null;
  const totals = invoiceTotals(db, invoiceId);
  const due = dueCents(totals.net, dates, asAt);
  return { due, behind: totals.paid < due && totals.owing > 0, dates, ...totals };
}

