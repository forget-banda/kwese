import { clearSession, touchSession } from "@/lib/auth";

export async function POST() {
  const ok = await touchSession();
  return Response.json({ ok });
}

export async function DELETE() {
  await clearSession();
  return Response.json({ ok: true });
}
