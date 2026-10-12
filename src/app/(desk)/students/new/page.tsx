import { redirect } from "next/navigation";
import { PageHeader, Panel } from "@/components/bits";
import { StudentFields } from "@/components/student-fields";
import { ActionForm } from "@/components/action-form";
import { getSessionUser } from "@/lib/auth";
import { getDb } from "@/lib/db";
import { categories, classes, currencies } from "@/lib/queries";
import { addStudentAction } from "@/server/actions";

export default async function NewStudentPage() {
  const user = await getSessionUser();
  if (user?.role === "general") redirect("/");
  const db = getDb();
  return (
    <div>
      <PageHeader kicker="Register" title="Add a pupil" lede="The student number is created when you save. It cannot be edited later." />
      <Panel className="max-w-2xl">
        <ActionForm action={addStudentAction} submit="Add pupil">
          <StudentFields classes={classes(db)} categories={categories(db)} currencies={currencies(db)} />
        </ActionForm>
      </Panel>
    </div>
  );
}
