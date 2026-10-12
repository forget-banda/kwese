import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { seedSample } from "./seed";

export type DB = Database.Database;

const globalForDb = globalThis as unknown as { weseDb?: DB };

export function dataDir() {
  return process.env.WESE_DATA_DIR || path.join(process.cwd(), "data");
}

export function dbFile() {
  return process.env.WESE_DB_PATH || path.join(dataDir(), "wese.sqlite");
}

export function resetDbHandle() {
  if (globalForDb.weseDb) {
    try {
      globalForDb.weseDb.close();
    } catch {
      /* already closed */
    }
  }
  globalForDb.weseDb = undefined;
}

export function getDb() {
  if (!globalForDb.weseDb) {
    fs.mkdirSync(path.dirname(dbFile()), { recursive: true });
    const db = new Database(dbFile());
    db.pragma("journal_mode = WAL");
    db.pragma("foreign_keys = ON");
    migrate(db);
    globalForDb.weseDb = db;
    const users = db.prepare("select count(*) as n from users").get() as { n: number };
    if (users.n === 0 && process.env.WESE_EMPTY !== "1") seedSample(db);
  }
  return globalForDb.weseDb;
}

export function one<T>(db: DB, sql: string, ...params: unknown[]): T | undefined {
  return db.prepare(sql).get(...params) as T | undefined;
}

export function many<T>(db: DB, sql: string, ...params: unknown[]): T[] {
  return db.prepare(sql).all(...params) as T[];
}

function migrate(db: DB) {
  db.exec(`
    create table if not exists school (
      id integer primary key check (id = 1),
      name text not null default '',
      address text not null default '',
      phone text not null default '',
      email text not null default '',
      logo_path text,
      billing text not null default 'term',
      pay_schedule text not null default 'term',
      currency_mode text not null default 'strict',
      idle_minutes integer not null default 3,
      retention_years integer not null default 7,
      is_sample integer not null default 0,
      hide_sample_banner integer not null default 0,
      smtp_host text not null default '',
      smtp_port integer not null default 587,
      smtp_security text not null default 'starttls',
      smtp_user text not null default '',
      smtp_pass text not null default '',
      mail_from text not null default '',
      mail_to text not null default '',
      backup_password text not null default '',
      last_auto_backup text,
      last_mail_error text,
      last_mail_at text
    );

    create table if not exists users (
      id integer primary key,
      username text not null unique,
      password_hash text not null,
      role text not null check (role in ('admin','bursar','general')),
      must_change_password integer not null default 0,
      failed_attempts integer not null default 0,
      locked_until text,
      created_at text not null
    );

    create table if not exists sessions (
      token text primary key,
      user_id integer not null references users(id),
      created_at text not null,
      last_seen text not null
    );

    create table if not exists currencies (
      code text primary key,
      symbol text not null,
      is_default integer not null default 0,
      sort_order integer not null default 0
    );

    create table if not exists exchange_rates (
      id integer primary key,
      from_code text not null,
      to_code text not null,
      rate real not null,
      effective_on text not null,
      created_at text not null
    );

    create table if not exists terms (
      id integer primary key,
      year integer not null,
      number integer not null,
      label text not null,
      opens_on text not null,
      closes_on text not null,
      is_current integer not null default 0,
      kind text not null default 'term',
      unique (year, number, kind)
    );

    create table if not exists classes (
      id integer primary key,
      name text not null,
      sort_order integer not null
    );

    create table if not exists fee_categories (
      id integer primary key,
      name text not null unique
    );

    create table if not exists fee_items (
      id integer primary key,
      name text not null unique,
      sort_order integer not null
    );

    create table if not exists fee_structures (
      id integer primary key,
      category_id integer not null references fee_categories(id),
      term_id integer not null references terms(id),
      currency_code text not null,
      unique (category_id, term_id, currency_code)
    );

    create table if not exists fee_structure_lines (
      id integer primary key,
      structure_id integer not null references fee_structures(id) on delete cascade,
      fee_item_id integer not null references fee_items(id),
      amount_cents integer not null,
      unique (structure_id, fee_item_id)
    );

    create table if not exists receipt_books (
      id integer primary key,
      name text not null,
      first_number integer not null,
      last_number integer not null,
      next_number integer not null,
      method text,
      active integer not null default 1
    );

    create table if not exists student_seq (
      id integer primary key check (id = 1),
      n integer not null
    );

    create table if not exists students (
      id integer primary key,
      student_number text not null unique,
      surname text not null,
      first_name text not null,
      gender text not null,
      class_id integer references classes(id),
      category_id integer references fee_categories(id),
      currency_code text not null,
      dob text,
      address text not null default '',
      guardian text not null default '',
      phone text not null default '',
      doctor text not null default '',
      emergency text not null default '',
      notes text not null default '',
      status text not null default 'active',
      left_on text,
      leave_reason text,
      leave_destination text,
      erased integer not null default 0,
      created_at text not null
    );

    create table if not exists invoices (
      id integer primary key,
      number text not null unique,
      student_id integer not null references students(id),
      term_id integer not null references terms(id),
      class_id integer,
      class_name text not null,
      currency_code text not null,
      created_at text not null,
      created_by integer,
      unique (student_id, term_id)
    );

    create table if not exists invoice_lines (
      id integer primary key,
      invoice_id integer not null references invoices(id),
      fee_item_id integer not null,
      fee_item_name text not null,
      amount_cents integer not null
    );

    create table if not exists adjustments (
      id integer primary key,
      invoice_id integer not null references invoices(id),
      amount_cents integer not null,
      reason text not null,
      created_by integer,
      created_at text not null,
      voided_at text,
      voided_by integer,
      void_reason text
    );

    create table if not exists payments (
      id integer primary key,
      invoice_id integer not null references invoices(id),
      receipt_number integer not null,
      receipt_book_id integer,
      amount_cents integer not null,
      received_cents integer not null,
      received_currency text not null,
      rate real,
      method text not null,
      paid_on text not null,
      note text not null default '',
      received_by integer,
      created_at text not null,
      voided_at text,
      voided_by integer,
      void_reason text
    );

    create table if not exists allocations (
      id integer primary key,
      payment_id integer not null references payments(id),
      fee_item_id integer not null,
      fee_item_name text not null,
      amount_cents integer not null
    );

    create table if not exists other_categories (
      id integer primary key,
      name text not null unique
    );

    create table if not exists other_income (
      id integer primary key,
      category_id integer not null,
      category_name text not null,
      currency_code text not null,
      amount_cents integer not null,
      description text not null default '',
      method text not null,
      received_on text not null,
      recorded_by integer,
      created_at text not null,
      voided_at text,
      voided_by integer,
      void_reason text
    );

    create table if not exists expenditure (
      id integer primary key,
      fund_kind text not null,
      fund_id integer not null,
      fund_name text not null,
      currency_code text not null,
      amount_cents integer not null,
      description text not null,
      spent_on text not null,
      recorded_by integer,
      created_at text not null,
      voided_at text,
      voided_by integer,
      void_reason text
    );

    create table if not exists closed_months (
      year integer not null,
      month integer not null,
      closed_at text not null,
      closed_by integer,
      primary key (year, month)
    );

    create table if not exists activity (
      id integer primary key,
      user_id integer,
      username text,
      action text not null,
      detail text not null,
      at text not null
    );

    create table if not exists promotions (
      id integer primary key,
      created_at text not null,
      created_by integer,
      undone_at text,
      plan_json text not null
    );

    create table if not exists import_batches (
      id text primary key,
      created_by integer,
      payload text not null,
      created_at text not null
    );

    create index if not exists idx_payments_paid on payments(paid_on);
    create index if not exists idx_students_class on students(class_id, status);
    create index if not exists idx_invoices_term on invoices(term_id);
  `);
  const school = db.prepare("select id from school where id = 1").get();
  if (!school) {
    db.prepare("insert into school (id, name) values (1, '')").run();
  }
  const seq = db.prepare("select id from student_seq where id = 1").get();
  if (!seq) db.prepare("insert into student_seq (id, n) values (1, 0)").run();
}
