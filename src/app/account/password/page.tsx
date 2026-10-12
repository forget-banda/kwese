import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { controlClass, Field } from "@/components/bits";
import { getSessionUser } from "@/lib/auth";
import { changePasswordAction } from "@/server/actions";

export const dynamic = "force-dynamic";

export default async function PasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5">
      <h1 className="font-heading text-3xl font-semibold">Choose your own password</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {user.mustChangePassword
          ? `${user.username}, the password you were given is temporary.`
          : "Change the password for this desk."}
      </p>
      <div className="mt-6">
        <ActionForm action={changePasswordAction} submit="Save password">
          {user.mustChangePassword ? null : (
            <Field label="Current password">
              <input name="current" type="password" className={controlClass} required />
            </Field>
          )}
          <Field label="New password" hint="At least 8 characters.">
            <input name="next" type="password" className={controlClass} required />
          </Field>
          <Field label="Type it again">
            <input name="confirm" type="password" className={controlClass} required />
          </Field>
        </ActionForm>
      </div>
    </main>
  );
}
