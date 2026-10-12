import assert from "node:assert/strict";
import { test } from "node:test";
import {
  daysInclusive,
  dueCents,
  fairFee,
  instalmentDates,
  parseMoney,
  splitCents,
  studentCode,
  yearsOld,
} from "./money";

test("a $500 payment splits 1:3 across tuition and levy", () => {
  const split = splitCents(50_000, [
    { key: "tuition", weight: 50_000 },
    { key: "levy", weight: 150_000 },
  ]);
  assert.equal(split.get("tuition"), 12_500);
  assert.equal(split.get("levy"), 37_500);
});

test("remainder cents land on the earliest line", () => {
  const split = splitCents(100, [
    { key: "a", weight: 1 },
    { key: "b", weight: 1 },
    { key: "c", weight: 1 },
  ]);
  assert.equal(split.get("a"), 34);
  assert.equal(split.get("b"), 33);
  assert.equal(split.get("c"), 33);
});

test("term 3 instalments run from opening day then the first of each month", () => {
  assert.deepEqual(instalmentDates("2026-09-08", "2026-12-04"), [
    "2026-09-08",
    "2026-10-01",
    "2026-11-01",
    "2026-12-01",
  ]);
});

test("half the term's fees are due by 12 October", () => {
  const dates = instalmentDates("2026-09-08", "2026-12-04");
  assert.equal(dueCents(24_000, dates, "2026-10-12"), 12_000);
  assert.equal(dueCents(46_000, dates, "2026-10-12"), 23_000);
  assert.equal(dueCents(636_000, dates, "2026-10-12"), 318_000);
});

test("part-term fee counts days from opening through the leaving date", () => {
  assert.equal(daysInclusive("2026-09-08", "2026-12-04"), 88);
  assert.equal(daysInclusive("2026-09-08", "2026-09-30"), 23);
  assert.equal(fairFee(24_000, "2026-09-08", "2026-12-04", "2026-09-30"), Math.round((24_000 * 23) / 88));
});

test("a pupil must be at least two", () => {
  assert.equal(yearsOld("2024-10-13", "2026-10-12"), 1);
  assert.equal(yearsOld("2024-10-12", "2026-10-12"), 2);
});

test("student numbers are initials plus a running sequence", () => {
  assert.equal(studentCode("Tanaka", "Moyo", 1), "TM00001");
  assert.equal(studentCode("  rudo", "ncube", 12), "RN00012");
});

test("money parsing accepts cents and thousands separators", () => {
  assert.equal(parseMoney("120"), 12_000);
  assert.equal(parseMoney("120.5"), 12_050);
  assert.equal(parseMoney("1,240.50"), 124_050);
  assert.throws(() => parseMoney("12.345"));
  assert.throws(() => parseMoney(""));
});
