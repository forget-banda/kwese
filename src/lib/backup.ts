import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import nodemailer from "nodemailer";
import { dataDir, dbFile, getDb, resetDbHandle } from "./db";
import { AppError } from "./errors";
import { harareHour, nowISO, todayISO } from "./format";
import { getSchool } from "./queries";

export function backupDir() {
  return path.join(dataDir(), "backups");
}

export function listBackups() {
  if (!fs.existsSync(backupDir())) return [];
  return fs
    .readdirSync(backupDir())
    .filter((name) => name.endsWith(".sqlite") || name.endsWith(".wkbackup"))
    .map((name) => {
      const full = path.join(backupDir(), name);
      const stat = fs.statSync(full);
      return { name, full, bytes: stat.size, mtime: stat.mtime.toISOString() };
    })
    .sort((a, b) => (a.mtime < b.mtime ? 1 : -1));
}

function prune() {
  const files = listBackups().filter((file) => file.name.endsWith(".sqlite") && !file.name.startsWith("safety-"));
  for (const extra of files.slice(30)) fs.rmSync(extra.full, { force: true });
}

export async function createBackup(kind: "manual" | "auto" | "safety") {
  const db = getDb();
  fs.mkdirSync(backupDir(), { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const name = kind === "safety" ? `safety-before-restore-${stamp}.sqlite` : `wese-${stamp}.sqlite`;
  const dest = path.join(backupDir(), name);
  await db.backup(dest);
  if (kind !== "safety") {
    db.prepare("update school set last_auto_backup = ? where id = 1").run(todayISO());
    prune();
  }
  return { name, dest };
}

export async function maybeDailyBackup() {
  try {
    const db = getDb();
    const school = getSchool(db);
    if (harareHour() < 17) return;
    if (school.last_auto_backup === todayISO()) return;
    await createBackup("auto");
  } catch (error) {
    console.error("Daily backup failed", error);
  }
}

export function encryptBytes(plain: Buffer, password: string) {
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const key = scryptSync(password, salt, 32);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from("WK1"), salt, iv, tag, data]);
}

export function decryptBytes(payload: Buffer, password: string) {
  if (payload.subarray(0, 3).toString() !== "WK1") throw new AppError("That file is not an encrypted Wese~Kwese backup.");
  const salt = payload.subarray(3, 19);
  const iv = payload.subarray(19, 31);
  const tag = payload.subarray(31, 47);
  const data = payload.subarray(47);
  const key = scryptSync(password, salt, 32);
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  try {
    return Buffer.concat([decipher.update(data), decipher.final()]);
  } catch {
    throw new AppError("That password did not open the backup.");
  }
}

export async function emailLatest(kind: "test" | "backup") {
  const db = getDb();
  const school = getSchool(db);
  const recipients = school.mail_to
    .split(/[,;\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!school.smtp_host || !school.smtp_user || !school.smtp_pass || !school.mail_from) {
    throw new AppError("Fill in the mail server, username, app password, and the address mail is sent from.");
  }
  if (recipients.length === 0) throw new AppError("Add at least one address to receive the backup.");
  if (recipients.length > 5) throw new AppError("A backup can go to at most 5 addresses.");
  const secure = school.smtp_security === "ssl";
  const transporter = nodemailer.createTransport({
    host: school.smtp_host,
    port: school.smtp_port,
    secure,
    auth: { user: school.smtp_user, pass: school.smtp_pass },
    requireTLS: school.smtp_security === "starttls",
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 8000,
  });
  const attachments = [];
  if (kind === "backup") {
    if (school.backup_password.length < 8) {
      throw new AppError("Set a zip password of at least 8 characters before e-mailing a backup. The database holds every pupil and receipt.");
    }
    const latest = listBackups().find((file) => file.name.endsWith(".sqlite") && !file.name.startsWith("safety-"));
    if (!latest) throw new AppError("Take a backup on this computer first.");
    const encrypted = encryptBytes(fs.readFileSync(latest.full), school.backup_password);
    attachments.push({ filename: latest.name.replace(/\.sqlite$/, ".wkbackup"), content: encrypted });
  }
  try {
    await transporter.sendMail({
      from: school.mail_from,
      to: recipients.join(", "),
      subject: kind === "test" ? `${school.name} — Wese~Kwese test` : `${school.name} — Wese~Kwese backup`,
      text:
        kind === "test"
          ? "This is a test from the fees desk. If you can read it, backup e-mail is working."
          : "An encrypted copy of the fees database is attached. Restore it from Backups with the same password. Without that password the file cannot be opened.",
      attachments,
    });
    db.prepare("update school set last_mail_error = null, last_mail_at = ? where id = 1").run(nowISO());
  } catch (error) {
    const message = error instanceof Error ? error.message : "The mail server did not accept the message.";
    db.prepare("update school set last_mail_error = ?, last_mail_at = ? where id = 1").run(message, nowISO());
    throw new AppError(message);
  }
}

export async function restoreBackup(source: Buffer, password: string) {
  let sqlite = source;
  if (source.subarray(0, 3).toString() === "WK1") {
    if (!password) throw new AppError("This backup is encrypted. Type its password.");
    sqlite = decryptBytes(source, password);
  }
  if (sqlite.subarray(0, 15).toString() !== "SQLite format 3") {
    throw new AppError("That file is not a Wese~Kwese backup.");
  }
  await createBackup("safety");
  const db = getDb();
  db.close();
  resetDbHandle();
  const file = dbFile();
  fs.rmSync(`${file}-wal`, { force: true });
  fs.rmSync(`${file}-shm`, { force: true });
  fs.writeFileSync(file, sqlite);
  getDb();
}
