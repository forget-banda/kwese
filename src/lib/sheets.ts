import ExcelJS from "exceljs";
import JSZip from "jszip";
import type { DB } from "./db";
import { categories, classes, currencies } from "./queries";

const HEADERS = [
  "Surname",
  "First name",
  "Gender",
  "Class",
  "Fee category",
  "Currency",
  "Date of birth",
  "Address",
  "Guardian",
  "Phone",
  "Doctor",
  "Emergency contact",
  "Notes",
];

export async function classWorkbooks(db: DB) {
  const list = classes(db);
  const cats = categories(db).map((category) => category.name);
  const codes = currencies(db).map((currency) => currency.code);
  const gender = ["Female", "Male"];
  const zip = new JSZip();
  for (const cls of list) {
    const book = new ExcelJS.Workbook();
    book.creator = "Wese~Kwese";
    const sheet = book.addWorksheet("Pupils");
    sheet.addRow(HEADERS);
    sheet.getRow(1).font = { bold: true };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    HEADERS.forEach((header, index) => {
      sheet.getColumn(index + 1).width = Math.max(16, header.length + 2);
    });
    for (let row = 2; row <= 80; row++) {
      sheet.getCell(row, 4).value = cls.name;
      sheet.getCell(row, 3).dataValidation = listValidation(gender);
      sheet.getCell(row, 4).dataValidation = listValidation(list.map((item) => item.name));
      sheet.getCell(row, 5).dataValidation = listValidation(cats);
      sheet.getCell(row, 6).dataValidation = listValidation(codes);
    }
    const help = book.addWorksheet("How to fill this in");
    help.getColumn(1).width = 88;
    [
      "One pupil per row. Surname, first name, gender and class are required.",
      "Date of birth is DD/MM/YYYY. Leave it blank if you do not have it yet.",
      "Fee category and currency can be left blank — the bursar chooses them when the sheet comes back.",
      "Do not rename the column headings. Extra columns are ignored.",
      "These sheets hold children's details. Send them only to the bursar, and delete your copy after import.",
      "In Excel: File → Info → Protect Workbook → Encrypt with Password, if you can.",
    ].forEach((line) => help.addRow([line]));
    const buffer = await book.xlsx.writeBuffer();
    zip.file(`${cls.name.replace(/[^\w]+/g, "-")}.xlsx`, Buffer.from(buffer));
  }
  return zip.generateAsync({ type: "nodebuffer" });
}

function listValidation(values: string[]): ExcelJS.DataValidation {
  const escaped = values.map((value) => value.replaceAll('"', '""')).join(",");
  return {
    type: "list",
    allowBlank: true,
    formulae: [`"${escaped}"`],
  };
}

export type SheetRow = {
  row: number;
  surname: string;
  firstName: string;
  gender: string;
  className: string;
  categoryName: string;
  currency: string;
  dob: string;
  address: string;
  guardian: string;
  phone: string;
  doctor: string;
  emergency: string;
  notes: string;
};

export async function readSheet(fileName: string, data: Buffer): Promise<SheetRow[]> {
  if (fileName.toLowerCase().endsWith(".csv")) return readCsv(data.toString("utf8"));
  const book = new ExcelJS.Workbook();
  await book.xlsx.load(data as unknown as ExcelJS.Buffer);
  const sheet = book.worksheets.find((item) => item.name !== "How to fill this in") ?? book.worksheets[0];
  if (!sheet) return [];
  const header = sheet.getRow(1);
  const map = new Map<string, number>();
  header.eachCell((cell, column) => {
    map.set(normalise(cellText(cell.value)), column);
  });
  const rows: SheetRow[] = [];
  sheet.eachRow((row, index) => {
    if (index === 1) return;
    const read = (name: string) => cellText(row.getCell(map.get(name) ?? 0).value);
    const parsed: SheetRow = {
      row: index,
      surname: read("surname"),
      firstName: read("first name"),
      gender: read("gender"),
      className: read("class"),
      categoryName: read("fee category"),
      currency: read("currency"),
      dob: read("date of birth"),
      address: read("address"),
      guardian: read("guardian") || read("parent") || read("parent or guardian"),
      phone: read("phone"),
      doctor: read("doctor"),
      emergency: read("emergency contact") || read("emergency"),
      notes: read("notes"),
    };
    if (Object.values(parsed).some((value, i) => i > 0 && String(value).trim())) rows.push(parsed);
  });
  return rows;
}

function readCsv(text: string): SheetRow[] {
  const table = parseCsv(text);
  if (table.length === 0) return [];
  const header = table[0]!.map(normalise);
  const col = (row: string[], name: string) => {
    const index = header.indexOf(name);
    return index >= 0 ? (row[index] ?? "").trim() : "";
  };
  return table.slice(1).map((row, index) => ({
    row: index + 2,
    surname: col(row, "surname"),
    firstName: col(row, "first name"),
    gender: col(row, "gender"),
    className: col(row, "class"),
    categoryName: col(row, "fee category"),
    currency: col(row, "currency"),
    dob: col(row, "date of birth"),
    address: col(row, "address"),
    guardian: col(row, "guardian") || col(row, "parent"),
    phone: col(row, "phone"),
    doctor: col(row, "doctor"),
    emergency: col(row, "emergency contact") || col(row, "emergency"),
    notes: col(row, "notes"),
  })).filter((row) => row.surname || row.firstName);
}

function normalise(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function cellText(value: ExcelJS.CellValue): string {
  if (value == null) return "";
  if (value instanceof Date) {
    const day = String(value.getDate()).padStart(2, "0");
    const month = String(value.getMonth() + 1).padStart(2, "0");
    return `${day}/${month}/${value.getFullYear()}`;
  }
  if (typeof value === "object") {
    if ("text" in value && value.text) return String(value.text).trim();
    if ("result" in value) return cellText(value.result as ExcelJS.CellValue);
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
  }
  return String(value).trim();
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.replace(/^\uFEFF/, "");
  for (let i = 0; i < source.length; i++) {
    const char = source[i];
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((line) => line.some((item) => item.trim()));
}
