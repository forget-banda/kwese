export type Weight = { key: string; weight: number };

/** Split a cent total across parts by weight. Remainder cents go to the earliest lines. */
export function splitCents(total: number, parts: Weight[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const part of parts) out.set(part.key, 0);
  const usable = parts
    .map((part, index) => ({ ...part, index }))
    .filter((part) => part.weight > 0);
  const sum = usable.reduce((s, part) => s + part.weight, 0);
  if (total <= 0 || sum <= 0) return out;

  const rows = usable.map((part) => {
    const exact = (total * part.weight) / sum;
    const floor = Math.floor(exact);
    return { ...part, floor, frac: exact - floor };
  });
  let used = rows.reduce((s, row) => s + row.floor, 0);
  rows.sort((a, b) => b.frac - a.frac || a.index - b.index);
  let i = 0;
  while (used < total && rows.length > 0) {
    rows[i % rows.length]!.floor += 1;
    used += 1;
    i += 1;
  }
  for (const row of rows) out.set(row.key, row.floor);
  return out;
}

/**
 * One instalment when the term opens, then the 1st of each later month
 * up to and including the closing date.
 */
export function instalmentDates(opens: string, closes: string): string[] {
  if (!opens || !closes || opens > closes) return opens ? [opens] : [];
  const dates = [opens];
  let year = Number(opens.slice(0, 4));
  let month = Number(opens.slice(5, 7)) + 1;
  if (month === 13) {
    month = 1;
    year += 1;
  }
  for (let guard = 0; guard < 36; guard++) {
    const date = `${year}-${String(month).padStart(2, "0")}-01`;
    if (date > closes) break;
    if (date > opens) dates.push(date);
    month += 1;
    if (month === 13) {
      month = 1;
      year += 1;
    }
  }
  return dates;
}

/** Equal shares. Any leftover cent sits on the earliest instalments. */
export function dueCents(netCents: number, dates: string[], asAt: string): number {
  if (netCents <= 0) return 0;
  if (dates.length === 0) return netCents;
  const dueCount = dates.filter((date) => date <= asAt).length;
  if (dueCount <= 0) return 0;
  if (dueCount >= dates.length) return netCents;
  const base = Math.floor(netCents / dates.length);
  const rem = netCents - base * dates.length;
  let due = 0;
  for (let i = 0; i < dueCount; i++) due += base + (i < rem ? 1 : 0);
  return due;
}

export function daysInclusive(from: string, to: string): number {
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 86_400_000) + 1;
}

/** Fee for the days actually attended, rounded to the nearest cent. */
export function fairFee(netCents: number, opens: string, closes: string, leftOn: string): number {
  if (netCents <= 0) return 0;
  if (leftOn <= opens) return 0;
  if (leftOn >= closes) return netCents;
  const total = daysInclusive(opens, closes);
  const attended = daysInclusive(opens, leftOn);
  if (total <= 0) return netCents;
  return Math.round((netCents * attended) / total);
}

export function yearsOld(dob: string, today: string): number {
  const born = new Date(`${dob}T00:00:00Z`);
  const now = new Date(`${today}T00:00:00Z`);
  if (Number.isNaN(born.getTime()) || Number.isNaN(now.getTime())) return -1;
  let age = now.getUTCFullYear() - born.getUTCFullYear();
  const month = now.getUTCMonth() - born.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < born.getUTCDate())) age -= 1;
  return age;
}

export function studentCode(firstName: string, surname: string, sequence: number): string {
  const initial = (value: string) => {
    const match = value.match(/[A-Za-z]/);
    return (match ? match[0] : "X").toUpperCase();
  };
  return `${initial(firstName)}${initial(surname)}${String(sequence).padStart(5, "0")}`;
}

export function parseMoney(input: string): number {
  const text = input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(text)) {
    throw new Error("Enter an amount like 120.00");
  }
  const [whole, frac = ""] = text.split(".");
  return Number(whole) * 100 + Number(frac.padEnd(2, "0"));
}
