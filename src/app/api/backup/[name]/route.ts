import fs from "node:fs";
import path from "node:path";
import { requireUser } from "@/lib/auth";
import { backupDir } from "@/lib/backup";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, context: { params: Promise<{ name: string }> }) {
  await requireUser(["admin"]);
  const { name } = await context.params;
  const safe = path.basename(name);
  if (!/^[\w.-]+$/.test(safe)) return new Response("Not found", { status: 404 });
  const full = path.join(backupDir(), safe);
  if (!full.startsWith(backupDir()) || !fs.existsSync(full)) return new Response("Not found", { status: 404 });
  const bytes = fs.readFileSync(full);
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/octet-stream",
      "Content-Disposition": `attachment; filename="${safe}"`,
    },
  });
}
