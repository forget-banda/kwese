import fs from "node:fs";
import { getDb } from "@/lib/db";
import { getSchool } from "@/lib/queries";

export const dynamic = "force-dynamic";

export function GET() {
  const school = getSchool(getDb());
  if (!school.logo_path || !fs.existsSync(school.logo_path)) {
    return new Response(null, { status: 404 });
  }
  const type = school.logo_path.endsWith(".png") ? "image/png" : "image/jpeg";
  const bytes = fs.readFileSync(school.logo_path);
  return new Response(bytes, {
    headers: { "Content-Type": type, "Cache-Control": "no-store" },
  });
}
