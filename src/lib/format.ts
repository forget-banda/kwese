const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

const SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function todayISO(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Harare",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function harareHour(now = new Date()) {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Harare",
    hour: "2-digit",
    hourCycle: "h23",
  }).format(now);
  return Number(hour);
}

export function nowISO() {
  return new Date().toISOString();
}

export function formatMoney(cents: number, symbol: string) {
  const sign = cents < 0 ? "−" : "";
  const abs = Math.abs(cents);
  const text = (abs / 100).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${sign}${symbol}${text}`;
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "";
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return iso;
  return `${Number(day)} ${SHORT[Number(month) - 1] ?? month} ${year}`;
}

export function formatWhen(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Harare",
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function monthName(month: number) {
  return MONTHS[month - 1] ?? String(month);
}

export function lastDayOfMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseDob(input: string): string | null {
  const text = input.trim();
  if (!text) return null;
  let iso = "";
  const isoMatch = text.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (isoMatch) iso = `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  else if (slash) {
    iso = `${slash[3]}-${slash[2]!.padStart(2, "0")}-${slash[1]!.padStart(2, "0")}`;
  } else return null;
  const [year, month, day] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(year!, month! - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month! - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return iso;
}

export const PAY_METHODS = [
  { id: "cash", label: "Cash" },
  { id: "bank", label: "Bank" },
  { id: "ecocash", label: "EcoCash" },
  { id: "telecash", label: "Telecash" },
  { id: "other", label: "Other" },
] as const;

export function methodLabel(id: string) {
  return PAY_METHODS.find((method) => method.id === id)?.label ?? id;
}

export const LEAVE_REASONS = [
  { id: "transferred", label: "Transferred" },
  { id: "completed", label: "Completed school" },
  { id: "withdrawn", label: "Withdrawn" },
  { id: "stopped", label: "Stopped attending" },
  { id: "expelled", label: "Expelled" },
  { id: "deceased", label: "Passed away" },
  { id: "mistake", label: "Entered by mistake or a duplicate" },
  { id: "other", label: "Other" },
] as const;

export function leaveLabel(id: string | null) {
  if (!id) return "";
  return LEAVE_REASONS.find((reason) => reason.id === id)?.label ?? id;
}

export function roleLabel(role: string) {
  if (role === "admin") return "Admin";
  if (role === "bursar") return "Bursar";
  return "General";
}
