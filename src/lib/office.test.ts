import assert from "node:assert/strict";
import fs from "node:fs";
import { before, test } from "node:test";
import { AppError } from "./errors";
import { fundBalance, recordPayment } from "./commands";
import { getDb, one, resetDbHandle } from "./db";
import { dashboard, debtors, fundReport } from "./queries";

before(() => {
  const file = "/tmp/wese-office-test.sqlite";
  for (const suffix of ["", "-wal", "-shm"]) fs.rmSync(file + suffix, { force: true });
  process.env.WESE_DB_PATH = file;
  process.env.WESE_EMPTY = "0";
  resetDbHandle();
});

test("the sample desk has Term 3 debtors and a pupil who is behind", () => {
  const db = getDb();
  const desk = dashboard(db);
  assert.equal(desk.term?.label, "Term 3");
  assert.equal(desk.active, 15);
  assert.equal(desk.left, 1);
  const report = debtors(db, { behind: true });
  const rudo = report.rows.find((row) => row.first_name === "Rudo");
  assert.ok(rudo);
  assert.equal(rudo.owing, 24_000);
  assert.equal(rudo.behind, true);
  const tanaka = report.rows.find((row) => row.first_name === "Tanaka");
  assert.equal(tanaka, undefined);
  const funds = fundReport(db);
  const building = funds.find((row) => row.name === "Building fund" && row.currency === "USD");
  assert.ok(building);
  assert.ok(building.closing > 0);
  assert.equal(fundBalance(db, "other", one<{ id: number }>(db, "select id from other_categories where name = 'Uniform sales'")!.id, "USD"), 5_500);
});

test("a receipt cannot overpay what is still owing", () => {
  const db = getDb();
  const invoice = one<{ id: number }>(
    db,
    `select i.id from invoices i
     join students s on s.id = i.student_id
     where s.first_name = 'Rudo'`,
  );
  assert.throws(
    () =>
      db.transaction(() => {
        recordPayment(db, { id: 2, username: "bursar", role: "bursar" }, {
          invoiceId: invoice!.id,
          receivedCents: 99_999,
          receivedCurrency: "USD",
          rate: null,
          method: "cash",
          paidOn: "2026-10-12",
          note: "",
        });
      })(),
    (error: unknown) => error instanceof AppError && /most this invoice can take/.test(error.message),
  );
});
