import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { formatDate, methodLabel, todayISO } from "@/lib/format";
import { dailyCash, debtors, fundReport, getSchool, listPayments } from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ kind: string }> }) {
  const user = await requireUser(["admin", "bursar"]);
  const { kind } = await context.params;
  const url = new URL(request.url);
  const format = url.searchParams.get("format") === "xlsx" ? "xlsx" : url.searchParams.get("format") === "doc" ? "doc" : "csv";
  const db = getDb();
  const school = getSchool(db);
  const today = todayISO();
  const from = url.searchParams.get("from") || today;
  const to = url.searchParams.get("to") || today;
  let title = "Export";
  let headers: string[] = [];
  let rows: (string | number)[][] = [];

  if (kind === "debtors") {
    const report = debtors(db, {
      termId: Number(url.searchParams.get("term") || "0") || undefined,
      classId: Number(url.searchParams.get("class") || "0") || undefined,
      behind: url.searchParams.get("behind") === "1",
      asAt: url.searchParams.get("asAt") || today,
    });
    title = `Debtors ${report.term?.label ?? ""}`;
    headers = ["Number", "Name", "Class", "Currency", "Owing", "Due by now", "Behind", "Status"];
    rows = report.rows.map((row) => [
      row.student_number,
      `${row.first_name} ${row.surname}`,
      row.class_name,
      row.currency_code,
      (row.owing / 100).toFixed(2),
      (row.due / 100).toFixed(2),
      row.behind ? "Yes" : "No",
      row.status,
    ]);
  } else if (kind === "cash") {
    const report = dailyCash(db, from, to);
    title = `Daily cash ${report.from} to ${report.to}`;
    headers = ["Kind", "Currency", "Method", "Received by", "Amount"];
    rows = [
      ...report.payments.map((row) => ["Fees", row.currency_code, methodLabel(row.method), row.username ?? "", (row.amount_cents / 100).toFixed(2)]),
      ...report.income.map((row) => [row.category_name, row.currency_code, methodLabel(row.method), row.username ?? "", (row.amount_cents / 100).toFixed(2)]),
    ];
  } else if (kind === "funds") {
    title = "Funds";
    headers = ["Fund", "Kind", "Currency", "Income", "Spent", "Closing"];
    rows = fundReport(db).map((row) => [row.name, row.kind, row.currency, (row.income / 100).toFixed(2), (row.spent / 100).toFixed(2), (row.closing / 100).toFixed(2)]);
  } else if (kind === "payments") {
    const report = listPayments(db, from, to);
    title = `Payments ${report.from} to ${report.to}`;
    headers = ["Receipt", "Date", "Pupil", "Number", "Method", "Currency", "Amount", "Voided"];
    rows = report.rows.map((row) => [
      row.receipt_number,
      formatDate(row.paid_on),
      `${row.first_name} ${row.surname}`,
      row.student_number,
      methodLabel(row.method),
      row.currency_code,
      (row.amount_cents / 100).toFixed(2),
      row.voided_at ? "Yes" : "",
    ]);
  } else {
    return NextResponse.json({ error: "Unknown export" }, { status: 404 });
  }

  const preamble = [school.name, title, `Printed by ${user.username}`, formatDate(today)];
  if (format === "xlsx") {
    const book = new ExcelJS.Workbook();
    const sheet = book.addWorksheet("Report");
    preamble.forEach((line) => sheet.addRow([line]));
    sheet.addRow([]);
    sheet.addRow(headers);
    rows.forEach((row) => sheet.addRow(row));
    const buffer = await book.xlsx.writeBuffer();
    return new Response(new Uint8Array(buffer), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${kind}.xlsx"`,
      },
    });
  }
  if (format === "doc") {
    const html = `<html><body><p>${preamble.join("<br>")}</p><table border="1"><tr>${headers.map((header) => `<th>${header}</th>`).join("")}</tr>${rows
      .map((row) => `<tr>${row.map((cell) => `<td>${cell}</td>`).join("")}</tr>`)
      .join("")}</table></body></html>`;
    return new Response(html, {
      headers: { "Content-Type": "application/msword", "Content-Disposition": `attachment; filename="${kind}.doc"` },
    });
  }
  const csv = [...preamble.map((line) => `"${line}"`), headers.join(","), ...rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","))].join("\n");
  return new Response(csv, {
    headers: { "Content-Type": "text/csv", "Content-Disposition": `attachment; filename="${kind}.csv"` },
  });
}
