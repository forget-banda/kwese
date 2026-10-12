"use server";

import fs from "node:fs";
import path from "node:path";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { signIn, signOut } from "@/lib/auth";
import { requireUser } from "@/lib/auth";
import { createBackup, emailLatest, restoreBackup } from "@/lib/backup";
import {
  addCategory,
  addClass,
  addCurrency,
  addFeeItem,
  addRate,
  addReceiptBook,
  addStudent,
  addTerm,
  addUser,
  addYearOfMonths,
  adjustInvoice,
  bringBack,
  changeOwnPassword,
  closeMonth,
  commitImport,
  copyStructures,
  createFirstAdmin,
  createStudentInvoice,
  dismissSample,
  eraseOldRecords,
  eraseStudent,
  generateInvoices,
  previewImport,
  promoteYear,
  recordExpenditure,
  recordLeaving,
  recordOtherIncome,
  recordPayment,
  reopenMonth,
  resetUserPassword,
  saveImportBatch,
  saveSchool,
  saveStructure,
  setCurrencyMode,
  setCurrentTerm,
  setLogo,
  undoPromotion,
  unlockUser,
  updateClass,
  updateStudent,
  voidAdjustment,
  voidExpenditure,
  voidOtherIncome,
  voidPayment,
} from "@/lib/commands";
import { dataDir, getDb } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { parseDob } from "@/lib/format";
import { parseMoney } from "@/lib/money";
import { readSheet } from "@/lib/sheets";
import { checked, errorText, field, type ActionState } from "@/server/guard";

function tx<T>(fn: (db: ReturnType<typeof getDb>) => T) {
  const db = getDb();
  return db.transaction(() => fn(db))();
}

function cents(input: string) {
  try {
    return parseMoney(input);
  } catch (error) {
    throw new AppError(error instanceof Error ? error.message : "Enter an amount.");
  }
}

function go(href: string): never {
  revalidatePath("/", "layout");
  redirect(href);
}

function fail(href: string, error: unknown): never {
  const message = errorText(error);
  const join = href.includes("?") ? "&" : "?";
  go(`${href}${join}error=${encodeURIComponent(message)}`);
}

export async function signInAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const result = await signIn(field(formData, "username"), String(formData.get("password") ?? ""));
    return result ?? {};
  } catch (error) {
    return { error: errorText(error) };
  }
}

export async function signOutAction() {
  await signOut();
}

export async function firstRunAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  try {
    const password = String(formData.get("password") ?? "");
    if (password !== String(formData.get("confirm") ?? "")) {
      return { error: "Type the same password twice." };
    }
    const actor = tx((db) =>
      createFirstAdmin(db, {
        school: field(formData, "school"),
        address: field(formData, "address"),
        phone: field(formData, "phone"),
        email: field(formData, "email"),
        username: field(formData, "username"),
        password,
      }),
    );
    await signIn(actor.username, password);
    return {};
  } catch (error) {
    return { error: errorText(error) };
  }
}

export async function changePasswordAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const { getSessionUser } = await import("@/lib/auth");
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  const next = String(formData.get("next") ?? "");
  if (next !== String(formData.get("confirm") ?? "")) return { error: "Type the new password twice." };
  try {
    tx((db) => changeOwnPassword(db, user, String(formData.get("current") ?? ""), next));
  } catch (error) {
    return { error: errorText(error) };
  }
  go("/");
}

export async function saveSchoolAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  try {
    const file = formData.get("logo");
    let logoPath: string | undefined;
    if (file instanceof File && file.size > 0) {
      if (!["image/png", "image/jpeg"].includes(file.type)) throw new AppError("The logo needs to be a PNG or JPG.");
      if (file.size > 1_500_000) throw new AppError("Use a logo smaller than 1.5 MB.");
      const ext = file.type === "image/png" ? "png" : "jpg";
      logoPath = path.join(dataDir(), `logo.${ext}`);
      fs.mkdirSync(dataDir(), { recursive: true });
      fs.writeFileSync(logoPath, Buffer.from(await file.arrayBuffer()));
    }
    tx((db) => {
      saveSchool(db, user, {
        name: field(formData, "name"),
        address: field(formData, "address"),
        phone: field(formData, "phone"),
        email: field(formData, "email"),
        billing: field(formData, "billing"),
        paySchedule: field(formData, "paySchedule"),
        retentionYears: Number(field(formData, "retention") || "7"),
        idleMinutes: Number(field(formData, "idle") || "3"),
      });
      if (logoPath) setLogo(db, user, logoPath);
      if (formData.get("removeLogo") === "1") setLogo(db, user, null);
    });
  } catch (error) {
    fail("/setup/school", error);
  }
  go("/setup/school?notice=School details saved");
}

export async function dismissSampleAction() {
  const user = await requireUser(["admin"]);
  tx((db) => dismissSample(db, user));
  go("/");
}

export async function currencyModeAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  try {
    tx((db) => setCurrencyMode(db, user, field(formData, "mode")));
  } catch (error) {
    fail("/", error);
  }
  go("/");
}

export async function addTermAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  try {
    tx((db) =>
      addTerm(db, user, {
        year: Number(field(formData, "year")),
        number: Number(field(formData, "number")),
        label: field(formData, "label"),
        opens: field(formData, "opens"),
        closes: field(formData, "closes"),
        current: checked(formData, "current"),
        kind: field(formData, "kind") || "term",
      }),
    );
  } catch (error) {
    fail("/setup/terms", error);
  }
  go("/setup/terms?notice=Saved");
}

export async function currentTermAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  tx((db) => setCurrentTerm(db, user, Number(field(formData, "id"))));
  go("/setup/terms");
}

export async function addYearAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  try {
    tx((db) => addYearOfMonths(db, user, Number(field(formData, "year"))));
  } catch (error) {
    fail("/setup/terms", error);
  }
  go("/setup/terms?notice=The year of months is ready");
}

export async function addClassAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  try {
    tx((db) => addClass(db, user, field(formData, "name"), Number(field(formData, "sort") || "0")));
  } catch (error) {
    fail("/setup/classes", error);
  }
  go("/setup/classes");
}

export async function updateClassAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  try {
    tx((db) => updateClass(db, user, Number(field(formData, "id")), field(formData, "name"), Number(field(formData, "sort") || "0")));
  } catch (error) {
    fail("/setup/classes", error);
  }
  go("/setup/classes");
}

export async function addCategoryAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  try {
    tx((db) => addCategory(db, user, field(formData, "name")));
  } catch (error) {
    fail("/setup/categories", error);
  }
  go("/setup/categories");
}

export async function addItemAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  try {
    tx((db) => addFeeItem(db, user, field(formData, "name")));
  } catch (error) {
    fail("/setup/items", error);
  }
  go("/setup/items");
}

export async function saveStructureAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  try {
    const amounts = [...formData.entries()]
      .filter(([key]) => key.startsWith("item-"))
      .map(([key, value]) => ({ itemId: Number(key.slice(5)), cents: cents(String(value || "0")) }));
    tx((db) =>
      saveStructure(db, user, {
        categoryId: Number(field(formData, "category")),
        termId: Number(field(formData, "term")),
        currency: field(formData, "currency"),
        amounts,
      }),
    );
  } catch (error) {
    fail("/setup/structures", error);
  }
  go("/setup/structures?notice=Fee structure saved");
}

export async function copyFeesAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  try {
    const targets = formData.getAll("target").map((value) => Number(value));
    const copied = tx((db) => copyStructures(db, user, Number(field(formData, "from")), targets));
    go(`/setup/structures?notice=${encodeURIComponent(`${copied} fee structures copied. Existing ones were left alone.`)}`);
  } catch (error) {
    fail("/setup/structures", error);
  }
}

export async function addBookAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  try {
    const next = field(formData, "next");
    tx((db) =>
      addReceiptBook(db, user, {
        name: field(formData, "name"),
        first: Number(field(formData, "first")),
        last: Number(field(formData, "last")),
        next: next ? Number(next) : null,
        method: field(formData, "method"),
      }),
    );
  } catch (error) {
    fail("/setup/receipts", error);
  }
  go("/setup/receipts");
}

export async function addCurrencyAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  try {
    tx((db) => addCurrency(db, user, field(formData, "code"), field(formData, "symbol"), checked(formData, "default")));
  } catch (error) {
    fail("/setup/currencies", error);
  }
  go("/setup/currencies");
}

export async function addRateAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  try {
    tx((db) =>
      addRate(db, user, field(formData, "from"), field(formData, "to"), Number(field(formData, "rate")), field(formData, "on")),
    );
  } catch (error) {
    fail("/setup/rates", error);
  }
  go("/setup/rates");
}

export async function addUserAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  try {
    const password = tx((db) => addUser(db, user, field(formData, "username"), field(formData, "role")));
    go(`/setup/users?notice=${encodeURIComponent(`Temporary password for ${field(formData, "username").toLowerCase()}: ${password}`)}`);
  } catch (error) {
    fail("/setup/users", error);
  }
}

export async function resetPasswordAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  try {
    const result = tx((db) => resetUserPassword(db, user, Number(field(formData, "id"))));
    go(`/setup/users?notice=${encodeURIComponent(`Temporary password for ${result.username}: ${result.password}`)}`);
  } catch (error) {
    fail("/setup/users", error);
  }
}

export async function unlockAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  tx((db) => unlockUser(db, user, Number(field(formData, "id"))));
  go("/setup/users?notice=Unlocked");
}

export async function addStudentAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "bursar"]);
  const dobText = field(formData, "dob");
  const dob = dobText ? parseDob(dobText) : null;
  if (dobText && !dob) return { error: "Date of birth must be a real date." };
  try {
    const created = tx((db) =>
      addStudent(db, user, {
        surname: field(formData, "surname"),
        firstName: field(formData, "firstName"),
        gender: field(formData, "gender"),
        classId: Number(field(formData, "classId")),
        categoryId: Number(field(formData, "categoryId")),
        currency: field(formData, "currency"),
        dob,
        address: field(formData, "address"),
        guardian: field(formData, "guardian"),
        phone: field(formData, "phone"),
        doctor: field(formData, "doctor"),
        emergency: field(formData, "emergency"),
        notes: field(formData, "notes"),
      }),
    );
    go(`/students/${created.id}`);
  } catch (error) {
    return { error: errorText(error) };
  }
}

export async function updateStudentAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "bursar"]);
  const id = Number(field(formData, "id"));
  const dobText = field(formData, "dob");
  if (dobText && !parseDob(dobText)) return { error: "Date of birth must be a real date." };
  try {
    tx((db) =>
      updateStudent(db, user, id, {
        surname: field(formData, "surname"),
        firstName: field(formData, "firstName"),
        gender: field(formData, "gender"),
        classId: Number(field(formData, "classId")),
        categoryId: Number(field(formData, "categoryId")),
        currency: field(formData, "currency"),
        dob: dobText ? parseDob(dobText) : null,
        address: field(formData, "address"),
        guardian: field(formData, "guardian"),
        phone: field(formData, "phone"),
        doctor: field(formData, "doctor"),
        emergency: field(formData, "emergency"),
        notes: field(formData, "notes"),
      }),
    );
  } catch (error) {
    return { error: errorText(error) };
  }
  go(`/students/${id}?notice=Details saved. An invoice already generated is not rebilled.`);
}

export async function leaveAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "bursar"]);
  const id = Number(field(formData, "id"));
  try {
    tx((db) =>
      recordLeaving(db, user, id, {
        reason: field(formData, "reason"),
        leftOn: field(formData, "leftOn"),
        destination: field(formData, "destination"),
      }),
    );
  } catch (error) {
    return { error: errorText(error) };
  }
  go(`/students/${id}`);
}

export async function returnAction(formData: FormData) {
  const user = await requireUser(["admin", "bursar"]);
  const id = Number(field(formData, "id"));
  try {
    tx((db) => bringBack(db, user, id));
  } catch (error) {
    fail(`/students/${id}`, error);
  }
  go(`/students/${id}?notice=They are active again`);
}

export async function eraseOneAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  const id = Number(field(formData, "id"));
  try {
    tx((db) => eraseStudent(db, user, id));
  } catch (error) {
    fail("/students/records", error);
  }
  go("/students/records?notice=Personal details erased. The student number and receipts stay.");
}

export async function eraseBulkAction() {
  const user = await requireUser(["admin"]);
  const count = tx((db) => eraseOldRecords(db, user));
  go(`/students/records?notice=${encodeURIComponent(`${count} former pupils had their personal details erased.`)}`);
}

export async function generateAction(formData: FormData) {
  const user = await requireUser(["admin", "bursar"]);
  try {
    const result = tx((db) => generateInvoices(db, user, Number(field(formData, "term"))));
    const skipped = result.skipped.length ? ` ${result.skipped.length} skipped.` : "";
    go(`/invoices?notice=${encodeURIComponent(`${result.created.length} invoices created.${skipped}`)}`);
  } catch (error) {
    fail("/invoices/generate", error);
  }
}

export async function billOneAction(formData: FormData) {
  const user = await requireUser(["admin", "bursar"]);
  const studentId = Number(field(formData, "student"));
  try {
    const invoiceId = tx((db) => createStudentInvoice(db, user, studentId, Number(field(formData, "term"))));
    go(`/invoices/${invoiceId}`);
  } catch (error) {
    fail(`/students/${studentId}`, error);
  }
}

export async function adjustAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin"]);
  const invoiceId = Number(field(formData, "invoice"));
  try {
    tx((db) => adjustInvoice(db, user, invoiceId, cents(field(formData, "amount")), field(formData, "reason")));
  } catch (error) {
    return { error: errorText(error) };
  }
  go(`/invoices/${invoiceId}?notice=Fees reduced`);
}

export async function voidAdjustAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  const invoiceId = Number(field(formData, "invoice"));
  try {
    tx((db) => voidAdjustment(db, user, Number(field(formData, "id")), field(formData, "reason")));
  } catch (error) {
    fail(`/invoices/${invoiceId}`, error);
  }
  go(`/invoices/${invoiceId}`);
}

export async function payAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "bursar"]);
  try {
    const result = tx((db) =>
      recordPayment(db, user, {
        invoiceId: Number(field(formData, "invoice")),
        receivedCents: cents(field(formData, "amount")),
        receivedCurrency: field(formData, "currency"),
        rate: field(formData, "rate") ? Number(field(formData, "rate")) : null,
        method: field(formData, "method"),
        paidOn: field(formData, "paidOn"),
        note: field(formData, "note"),
      }),
    );
    const notice = result.notice ? `&notice=${encodeURIComponent(result.notice)}` : "";
    go(`/receipts/${result.id}?fresh=1${notice}`);
  } catch (error) {
    return { error: errorText(error) };
  }
}

export async function voidPayAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "bursar"]);
  const id = Number(field(formData, "id"));
  try {
    tx((db) => voidPayment(db, user, id, field(formData, "reason")));
  } catch (error) {
    return { error: errorText(error) };
  }
  go(`/receipts/${id}`);
}

export async function spendAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "bursar"]);
  try {
    const notice = tx((db) =>
      recordExpenditure(db, user, {
        fundKey: field(formData, "fund"),
        amountCents: cents(field(formData, "amount")),
        description: field(formData, "description"),
        spentOn: field(formData, "spentOn"),
      }),
    );
    go(`/expenditure?notice=${encodeURIComponent(notice || "Expenditure recorded")}`);
  } catch (error) {
    return { error: errorText(error) };
  }
}

export async function voidSpendAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "bursar"]);
  try {
    tx((db) => voidExpenditure(db, user, Number(field(formData, "id")), field(formData, "reason")));
  } catch (error) {
    return { error: errorText(error) };
  }
  go("/expenditure");
}

export async function incomeAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "bursar"]);
  try {
    const notice = tx((db) =>
      recordOtherIncome(db, user, {
        categoryId: Number(field(formData, "category") || "0"),
        newCategory: field(formData, "newCategory"),
        currency: field(formData, "currency"),
        amountCents: cents(field(formData, "amount")),
        description: field(formData, "description"),
        method: field(formData, "method"),
        receivedOn: field(formData, "receivedOn"),
      }),
    );
    go(`/income?notice=${encodeURIComponent(notice || "Income recorded")}`);
  } catch (error) {
    return { error: errorText(error) };
  }
}

export async function voidIncomeAction(_state: ActionState, formData: FormData): Promise<ActionState> {
  const user = await requireUser(["admin", "bursar"]);
  try {
    tx((db) => voidOtherIncome(db, user, Number(field(formData, "id")), field(formData, "reason")));
  } catch (error) {
    return { error: errorText(error) };
  }
  go("/income");
}

export async function closeMonthAction(formData: FormData) {
  const user = await requireUser(["admin", "bursar"]);
  try {
    tx((db) => closeMonth(db, user, Number(field(formData, "year")), Number(field(formData, "month"))));
  } catch (error) {
    fail("/month-end", error);
  }
  go("/month-end?notice=Month closed");
}

export async function reopenMonthAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  try {
    tx((db) => reopenMonth(db, user, Number(field(formData, "year")), Number(field(formData, "month"))));
  } catch (error) {
    fail("/month-end", error);
  }
  go("/month-end?notice=Month reopened");
}

export async function promoteAction(formData: FormData) {
  const user = await requireUser(["admin", "bursar"]);
  try {
    const destinationByClass: Record<number, string> = {};
    const repeating: number[] = [];
    for (const [key, value] of formData.entries()) {
      if (key.startsWith("dest-")) destinationByClass[Number(key.slice(5))] = String(value);
      if (key.startsWith("repeat-")) repeating.push(Number(key.slice(7)));
    }
    const count = tx((db) => promoteYear(db, user, { destinationByClass, repeating }));
    go(`/students/promote?notice=${encodeURIComponent(`${count} pupils moved. Past invoices still show the class they were billed in.`)}`);
  } catch (error) {
    fail("/students/promote", error);
  }
}

export async function undoPromoteAction() {
  const user = await requireUser(["admin", "bursar"]);
  try {
    const result = tx((db) => undoPromotion(db, user));
    go(`/students/promote?notice=${encodeURIComponent(`${result.undone} put back. ${result.left} had changed since, and were left as they are.`)}`);
  } catch (error) {
    fail("/students/promote", error);
  }
}

export async function checkSheetsAction(formData: FormData) {
  const user = await requireUser(["admin", "bursar"]);
  try {
    const files = formData.getAll("files").filter((item): item is File => item instanceof File && item.size > 0);
    if (files.length === 0) throw new AppError("Choose at least one filled sheet.");
    const parsed: Awaited<ReturnType<typeof readSheet>> = [];
    for (const file of files) {
      const rows = await readSheet(file.name, Buffer.from(await file.arrayBuffer()));
      parsed.push(...rows);
    }
    const defaults = { categoryName: field(formData, "category"), className: field(formData, "className") };
    const id = tx((db) => {
      const rows = previewImport(db, parsed, defaults);
      return saveImportBatch(db, user, { rows, defaults, fileName: files.map((file) => file.name).join(", ") });
    });
    go(`/students/import?batch=${id}`);
  } catch (error) {
    fail("/students/import", error);
  }
}

export async function commitSheetsAction(formData: FormData) {
  const user = await requireUser(["admin", "bursar"]);
  try {
    const result = tx((db) => commitImport(db, user, field(formData, "batch")));
    go(`/students?notice=${encodeURIComponent(`${result.added} pupils added. ${result.skipped} rows were left out.`)}`);
  } catch (error) {
    fail("/students/import", error);
  }
}

export async function backupNowAction() {
  await requireUser(["admin"]);
  try {
    const file = await createBackup("manual");
    go(`/setup/backups?notice=${encodeURIComponent(`Backup saved on this computer: ${file.name}`)}`);
  } catch (error) {
    fail("/setup/backups", error);
  }
}

export async function mailTestAction() {
  await requireUser(["admin"]);
  try {
    await emailLatest("test");
    go("/setup/backups?notice=Test e-mail sent");
  } catch (error) {
    fail("/setup/backups", error);
  }
}

export async function mailBackupAction() {
  await requireUser(["admin"]);
  try {
    await emailLatest("backup");
    go("/setup/backups?notice=Encrypted backup e-mailed");
  } catch (error) {
    fail("/setup/backups", error);
  }
}

export async function saveMailAction(formData: FormData) {
  const user = await requireUser(["admin"]);
  const password = field(formData, "backupPassword");
  if (password && password.length < 8) fail("/setup/backups", new AppError("The backup password needs at least 8 characters."));
  const db = getDb();
  db.prepare(
    `update school set smtp_host=?, smtp_port=?, smtp_security=?, smtp_user=?, smtp_pass=?, mail_from=?, mail_to=?, backup_password=? where id=1`,
  ).run(
    field(formData, "host"),
    Number(field(formData, "port") || "587"),
    field(formData, "security") || "starttls",
    field(formData, "user"),
    field(formData, "pass"),
    field(formData, "from"),
    field(formData, "to"),
    password,
  );
  const { log } = await import("@/lib/commands");
  log(db, user, "Backup mail", "Settings saved");
  go("/setup/backups?notice=Mail settings saved");
}

export async function restoreAction(formData: FormData) {
  await requireUser(["admin"]);
  if (field(formData, "confirm") !== "RESTORE") {
    fail("/setup/backups", new AppError("Type RESTORE to replace the live books."));
  }
  try {
    const upload = formData.get("file");
    let source: Buffer | null = null;
    if (upload instanceof File && upload.size > 0) source = Buffer.from(await upload.arrayBuffer());
    else if (field(formData, "existing")) {
      const { backupDir } = await import("@/lib/backup");
      const name = path.basename(field(formData, "existing"));
      source = fs.readFileSync(path.join(backupDir(), name));
    }
    if (!source) throw new AppError("Choose a backup file.");
    await restoreBackup(source, field(formData, "password"));
  } catch (error) {
    fail("/setup/backups", error);
  }
  go("/?notice=Backup restored. A safety copy of the previous books was kept.");
}
