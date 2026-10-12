import type { DB } from "./db";
import { one } from "./db";
import {
  addCategory,
  addClass,
  addCurrency,
  addFeeItem,
  addOtherCategory,
  addRate,
  addReceiptBook,
  addStudent,
  addTerm,
  closeMonth,
  generateInvoices,
  recordExpenditure,
  recordLeaving,
  recordOtherIncome,
  recordPayment,
  saveStructure,
} from "./commands";
import type { Actor } from "./types";
import { hashPassword } from "./password";
import { nowISO } from "./format";

type SeedActor = Actor;

function id(db: DB, sql: string, ...params: unknown[]) {
  const row = one<{ id: number }>(db, sql, ...params);
  if (!row) throw new Error(`Seed lookup failed: ${sql}`);
  return row.id;
}

export function seedSample(db: DB) {
  const run = db.transaction(() => {
    db.prepare(
      `update school set
        name = 'Chiedza Primary School',
        address = '14 Chiremba Road, Mufakose, Harare',
        phone = '+263 24 200 4418',
        email = 'bursar@chiedza.school',
        billing = 'term',
        pay_schedule = 'instalments',
        currency_mode = 'strict',
        idle_minutes = 20,
        retention_years = 7,
        is_sample = 1,
        hide_sample_banner = 0
      where id = 1`,
    ).run();

    const insertUser = db.prepare(
      "insert into users (username, password_hash, role, must_change_password, created_at) values (?, ?, ?, 0, ?)",
    );
    const adminId = Number(
      insertUser.run("admin", hashPassword("kwese1840"), "admin", nowISO()).lastInsertRowid,
    );
    const bursarId = Number(
      insertUser.run("bursar", hashPassword("bursar1840"), "bursar", nowISO()).lastInsertRowid,
    );
    insertUser.run("teacher", hashPassword("teacher1840"), "general", nowISO());
    const admin: SeedActor = { id: adminId, username: "admin", role: "admin" };
    const bursar: SeedActor = { id: bursarId, username: "bursar", role: "bursar" };

    addCurrency(db, admin, "USD", "$", true);
    addCurrency(db, admin, "ZIG", "ZiG ", false);
    addRate(db, admin, "USD", "ZIG", 26.5, "2026-10-01");
    addRate(db, admin, "ZIG", "USD", 1 / 26.5, "2026-10-01");

    addTerm(db, admin, {
      year: 2026,
      number: 1,
      label: "Term 1",
      opens: "2026-01-13",
      closes: "2026-04-10",
      current: false,
      kind: "term",
    });
    addTerm(db, admin, {
      year: 2026,
      number: 2,
      label: "Term 2",
      opens: "2026-05-12",
      closes: "2026-08-07",
      current: false,
      kind: "term",
    });
    addTerm(db, admin, {
      year: 2026,
      number: 3,
      label: "Term 3",
      opens: "2026-09-08",
      closes: "2026-12-04",
      current: true,
      kind: "term",
    });
    const term3 = id(db, "select id from terms where year = 2026 and number = 3 and kind = 'term'");

    const classNames = ["ECD A", "ECD B", "Grade 1", "Grade 2", "Grade 3", "Grade 4", "Grade 5", "Grade 6", "Grade 7"];
    classNames.forEach((name, index) => addClass(db, admin, name, index + 1));
    const classId = (name: string) => id(db, "select id from classes where name = ?", name);

    addCategory(db, admin, "Day scholar");
    addCategory(db, admin, "Boarder");
    addCategory(db, admin, "Staff child");
    const categoryId = (name: string) => id(db, "select id from fee_categories where name = ?", name);

    for (const name of ["Tuition", "Levy", "Building fund", "Boarding"]) addFeeItem(db, admin, name);
    const itemId = (name: string) => id(db, "select id from fee_items where name = ?", name);
    const tuition = itemId("Tuition");
    const levy = itemId("Levy");
    const building = itemId("Building fund");
    const boarding = itemId("Boarding");

    const day = categoryId("Day scholar");
    const boarder = categoryId("Boarder");
    const staff = categoryId("Staff child");
    saveStructure(db, admin, {
      categoryId: day,
      termId: term3,
      currency: "USD",
      amounts: [
        { itemId: tuition, cents: 18_000 },
        { itemId: levy, cents: 4_000 },
        { itemId: building, cents: 2_000 },
      ],
    });
    saveStructure(db, admin, {
      categoryId: boarder,
      termId: term3,
      currency: "USD",
      amounts: [
        { itemId: tuition, cents: 18_000 },
        { itemId: levy, cents: 4_000 },
        { itemId: building, cents: 2_000 },
        { itemId: boarding, cents: 22_000 },
      ],
    });
    saveStructure(db, admin, {
      categoryId: staff,
      termId: term3,
      currency: "USD",
      amounts: [
        { itemId: tuition, cents: 9_000 },
        { itemId: levy, cents: 2_000 },
        { itemId: building, cents: 1_000 },
      ],
    });
    saveStructure(db, admin, {
      categoryId: day,
      termId: term3,
      currency: "ZIG",
      amounts: [
        { itemId: tuition, cents: 477_000 },
        { itemId: levy, cents: 106_000 },
        { itemId: building, cents: 53_000 },
      ],
    });

    addReceiptBook(db, admin, { name: "Office book", first: 1001, last: 1999, next: 1001, method: "" });

    const pupils: {
      surname: string;
      firstName: string;
      gender: "Female" | "Male";
      className: string;
      category: string;
      currency: string;
      dob: string;
      guardian: string;
      phone: string;
    }[] = [
      ["Moyo", "Tanaka", "Male", "Grade 5", "Day scholar", "USD", "2015-03-12", "Mrs Moyo", "0772 111 001"],
      ["Ncube", "Rudo", "Female", "Grade 3", "Day scholar", "USD", "2017-06-01", "Mr Ncube", "0773 220 114"],
      ["Dube", "Farai", "Male", "Grade 7", "Boarder", "USD", "2013-01-20", "Mrs Dube", "0712 880 220"],
      ["Sibanda", "Chipo", "Female", "Grade 1", "Day scholar", "USD", "2019-11-02", "Ms Sibanda", "0782 441 009"],
      ["Chirwa", "Tendai", "Male", "Grade 4", "Day scholar", "ZIG", "2016-08-08", "Mr Chirwa", "0775 300 218"],
      ["Mpofu", "Nyasha", "Female", "Grade 2", "Day scholar", "USD", "2018-02-14", "Mrs Mpofu", "0733 100 554"],
      ["Ndlovu", "Blessing", "Male", "Grade 6", "Boarder", "USD", "2014-05-05", "Mr Ndlovu", "0719 662 430"],
      ["Gumbo", "Tariro", "Female", "ECD A", "Day scholar", "USD", "2021-09-01", "Mrs Gumbo", "0771 255 808"],
      ["Zhou", "Kudakwashe", "Male", "Grade 5", "Staff child", "USD", "2015-12-12", "Mr Zhou", "0772 900 112"],
      ["Banda", "Anesu", "Male", "Grade 3", "Day scholar", "USD", "2017-04-04", "Mrs Banda", "0783 010 773"],
      ["Mlambo", "Rutendo", "Female", "Grade 4", "Day scholar", "USD", "2016-07-19", "Mr Mlambo", "0712 444 218"],
      ["Phiri", "Tadiwa", "Male", "Grade 6", "Day scholar", "USD", "2014-10-10", "Mrs Phiri", "0774 818 300"],
      ["Khumalo", "Munashe", "Female", "Grade 2", "Boarder", "USD", "2018-03-03", "Mr Khumalo", "0732 551 640"],
      ["Mutasa", "Shamiso", "Female", "Grade 7", "Day scholar", "USD", "2013-06-22", "Mrs Mutasa", "0778 212 909"],
      ["Ngwenya", "Panashe", "Male", "ECD B", "Day scholar", "USD", "2022-01-15", "Ms Ngwenya", "0716 333 271"],
      ["Dube", "Rumbidzai", "Female", "Grade 1", "Day scholar", "USD", "2019-04-30", "Mr Dube", "0772 616 404"],
    ].map(([surname, firstName, gender, className, category, currency, dob, guardian, phone]) => ({
      surname,
      firstName,
      gender: gender as "Female" | "Male",
      className,
      category,
      currency,
      dob,
      guardian,
      phone,
    }));

    for (const pupil of pupils) {
      addStudent(db, bursar, {
        ...pupil,
        classId: classId(pupil.className),
        categoryId: categoryId(pupil.category),
        address: "Mufakose, Harare",
      });
    }

    generateInvoices(db, bursar, term3);

    const pay = (
      surname: string,
      firstName: string,
      cents: number,
      currency: string,
      method: string,
      paidOn: string,
    ) => {
      const student = one<{ id: number }>(
        db,
        "select id from students where surname = ? and first_name = ?",
        surname,
        firstName,
      );
      const invoice = one<{ id: number }>(
        db,
        "select id from invoices where student_id = ? and term_id = ?",
        student!.id,
        term3,
      );
      recordPayment(db, bursar, {
        invoiceId: invoice!.id,
        receivedCents: cents,
        receivedCurrency: currency,
        rate: null,
        method,
        paidOn,
        note: "",
      });
    };

    pay("Moyo", "Tanaka", 12_000, "USD", "cash", "2026-09-10");
    pay("Dube", "Farai", 46_000, "USD", "ecocash", "2026-09-09");
    pay("Sibanda", "Chipo", 4_000, "USD", "cash", "2026-09-15");
    pay("Chirwa", "Tendai", 200_000, "ZIG", "bank", "2026-09-20");
    pay("Mpofu", "Nyasha", 24_000, "USD", "bank", "2026-09-11");
    pay("Gumbo", "Tariro", 6_000, "USD", "cash", "2026-10-02");
    pay("Zhou", "Kudakwashe", 12_000, "USD", "cash", "2026-09-08");
    pay("Banda", "Anesu", 6_000, "USD", "cash", "2026-09-12");
    pay("Mlambo", "Rutendo", 24_000, "USD", "ecocash", "2026-09-18");
    pay("Phiri", "Tadiwa", 18_000, "USD", "bank", "2026-10-12");
    pay("Khumalo", "Munashe", 23_000, "USD", "cash", "2026-10-01");
    pay("Mutasa", "Shamiso", 24_000, "USD", "ecocash", "2026-09-14");
    pay("Dube", "Rumbidzai", 24_000, "USD", "bank", "2026-09-16");

    const anesu = id(db, "select id from students where surname = 'Banda' and first_name = 'Anesu'");
    recordLeaving(db, bursar, anesu, {
      reason: "transferred",
      leftOn: "2026-09-30",
      destination: "Glen View 2 Primary",
    });

    const uniforms = addOtherCategory(db, bursar, "Uniform sales");
    const tuck = addOtherCategory(db, bursar, "Tuck shop");
    recordOtherIncome(db, bursar, {
      categoryId: uniforms,
      newCategory: "",
      currency: "USD",
      amountCents: 8_500,
      description: "Grade 1 shirts",
      method: "cash",
      receivedOn: "2026-09-12",
    });
    recordOtherIncome(db, bursar, {
      categoryId: tuck,
      newCategory: "",
      currency: "USD",
      amountCents: 4_000,
      description: "Friday tuck",
      method: "cash",
      receivedOn: "2026-10-06",
    });

    const buildingId = itemId("Building fund");
    const levyId = itemId("Levy");
    recordExpenditure(db, bursar, {
      fundKey: `fee:${buildingId}:USD`,
      amountCents: 3_500,
      description: "Paint for the Grade 7 block",
      spentOn: "2026-09-18",
    });
    recordExpenditure(db, bursar, {
      fundKey: `fee:${levyId}:USD`,
      amountCents: 2_250,
      description: "Exercise books",
      spentOn: "2026-10-03",
    });
    recordExpenditure(db, bursar, {
      fundKey: `other:${uniforms}:USD`,
      amountCents: 3_000,
      description: "Restock skirts",
      spentOn: "2026-09-25",
    });

    closeMonth(db, admin, 2026, 8);
  });
  run();
}
