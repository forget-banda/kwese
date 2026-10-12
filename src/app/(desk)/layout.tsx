import { redirect } from "next/navigation";
import { IdleWatch } from "@/components/idle-watch";
import { Shell } from "@/components/shell";
import { getSessionUser } from "@/lib/auth";
import { maybeDailyBackup } from "@/lib/backup";
import { getDb } from "@/lib/db";
import { getSchool } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DeskLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  if (user.mustChangePassword) redirect("/account/password");
  await maybeDailyBackup();
  const school = getSchool(getDb());
  return (
    <>
      <Shell user={user} school={school.name || "School fees"} hasLogo={Boolean(school.logo_path)}>
        {children}
      </Shell>
      <IdleWatch minutes={school.idle_minutes} />
    </>
  );
}
