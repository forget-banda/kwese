import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { controlClass, Field } from "@/components/bits";
import { getDb } from "@/lib/db";
import { userCount } from "@/lib/queries";
import { firstRunAction } from "@/server/actions";

export const dynamic = "force-dynamic";

export default function FirstRunPage() {
  if (userCount(getDb()) > 0) redirect("/sign-in");
  return (
    <main className="mx-auto flex min-h-screen max-w-lg flex-col justify-center px-5 py-12">
      <p className="text-xs font-semibold tracking-[0.14em] text-primary uppercase">First run</p>
      <h1 className="font-heading text-4xl font-semibold">Name the school, then the first admin.</h1>
      <p className="mt-2 text-muted-foreground">
        The school name is the first line on every receipt. The admin can add the bursar afterwards.
      </p>
      <div className="mt-6">
        <ActionForm action={firstRunAction} submit="Open the desk">
          <Field label="School name">
            <input name="school" className={controlClass} required />
          </Field>
          <Field label="Address">
            <input name="address" className={controlClass} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone">
              <input name="phone" className={controlClass} />
            </Field>
            <Field label="E-mail">
              <input name="email" type="email" className={controlClass} />
            </Field>
          </div>
          <Field label="Admin username">
            <input name="username" className={controlClass} required autoComplete="username" />
          </Field>
          <Field label="Password" hint="At least 8 characters.">
            <input name="password" type="password" className={controlClass} required />
          </Field>
          <Field label="Confirm password">
            <input name="confirm" type="password" className={controlClass} required />
          </Field>
        </ActionForm>
      </div>
    </main>
  );
}
