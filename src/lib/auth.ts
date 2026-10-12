import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getDb, one } from "./db";
import { getSchool } from "./queries";
import { nowISO } from "./format";
import { verifyPassword } from "./password";
import type { Actor, Role } from "./types";

const COOKIE = "wese_session";

type SessionUser = Actor & { mustChangePassword: boolean };

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const db = getDb();
  const row = one<{
    user_id: number;
    username: string;
    role: Role;
    must_change_password: number;
    last_seen: string;
  }>(
    db,
    `select s.user_id, s.last_seen, u.username, u.role, u.must_change_password
     from sessions s join users u on u.id = s.user_id where s.token = ?`,
    token,
  );
  if (!row) return null;
  const idleMs = getSchool(db).idle_minutes * 60 * 1000;
  if (Date.now() - Date.parse(row.last_seen) > idleMs) {
    db.prepare("delete from sessions where token = ?").run(token);
    return null;
  }
  db.prepare("update sessions set last_seen = ? where token = ?").run(nowISO(), token);
  return {
    id: row.user_id,
    username: row.username,
    role: row.role,
    mustChangePassword: row.must_change_password === 1,
  };
}

export async function requireUser(roles?: Role[]) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.mustChangePassword) redirect("/account/password");
  if (roles && !roles.includes(user.role)) redirect("/?error=That part of the desk is for someone else.");
  return user;
}

export async function signIn(username: string, password: string) {
  const db = getDb();
  const name = username.trim().toLowerCase();
  const user = one<{
    id: number;
    username: string;
    password_hash: string;
    role: Role;
    failed_attempts: number;
    locked_until: string | null;
    must_change_password: number;
  }>(db, "select * from users where username = ?", name);
  if (!user) return { error: "That username or password is not right." };
  if (user.locked_until && user.locked_until > new Date().toISOString()) {
    return { error: "That username is locked for 15 minutes after five wrong passwords." };
  }
  if (!verifyPassword(password, user.password_hash)) {
    const attempts = user.failed_attempts + 1;
    if (attempts >= 5) {
      const until = new Date(Date.now() + 15 * 60 * 1000).toISOString();
      db.prepare("update users set failed_attempts = 0, locked_until = ? where id = ?").run(until, user.id);
      return { error: "That username is locked for 15 minutes after five wrong passwords." };
    }
    db.prepare("update users set failed_attempts = ? where id = ?").run(attempts, user.id);
    return { error: "That username or password is not right." };
  }
  db.prepare("update users set failed_attempts = 0, locked_until = null where id = ?").run(user.id);
  const token = randomBytes(32).toString("hex");
  const now = nowISO();
  db.prepare("insert into sessions (token, user_id, created_at, last_seen) values (?, ?, ?, ?)").run(
    token,
    user.id,
    now,
    now,
  );
  const jar = await cookies();
  jar.set(COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: 60 * 60 * 24 * 14 });
  if (user.must_change_password) redirect("/account/password");
  redirect("/");
}

export async function clearSession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) getDb().prepare("delete from sessions where token = ?").run(token);
  jar.delete(COOKIE);
}

export async function signOut() {
  await clearSession();
  redirect("/sign-in");
}

export async function touchSession() {
  const user = await getSessionUser();
  return Boolean(user);
}
