import { requireUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { classWorkbooks } from "@/lib/sheets";

export const dynamic = "force-dynamic";

export async function GET() {
  const user = await requireUser(["admin", "bursar"]);
  if (!user) return new Response("Sign in required", { status: 401 });
  const zip = await classWorkbooks(getDb());
  return new Response(new Uint8Array(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": "attachment; filename=class-sheets.zip",
    },
  });
}
