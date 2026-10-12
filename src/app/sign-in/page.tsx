import { redirect } from "next/navigation";
import { ActionForm } from "@/components/action-form";
import { controlClass, Field } from "@/components/bits";
import { getDb } from "@/lib/db";
import { getSchool, userCount } from "@/lib/queries";
import { signInAction } from "@/server/actions";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const db = getDb();
  if (userCount(db) === 0) redirect("/first-run");
  const school = getSchool(db);
  const params = await searchParams;
  const idle = params.reason === "idle";
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_0.9fr]">
      <section className="hidden flex-col justify-between bg-primary p-10 text-primary-foreground lg:flex">
        <p className="font-heading text-3xl">Wese~Kwese</p>
        <div>
          <h1 className="font-heading text-5xl leading-tight font-semibold text-balance">The fees desk for the school office.</h1>
          <p className="mt-4 max-w-md text-primary-foreground/80">
            Receipts, invoices, debtors, daily cash and funds. USD and ZiG stay in their own columns. One computer keeps the books; every other screen just opens them.
          </p>
        </div>
        <p className="text-sm text-primary-foreground/70">Chiedza Primary sample · Harare</p>
      </section>
      <section className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          {school.logo_path ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src="/api/logo" alt="" className="mb-4 h-16 w-16 object-contain" />
          ) : null}
          <p className="font-heading text-3xl font-semibold lg:hidden">Wese~Kwese</p>
          <h2 className="font-heading text-2xl font-semibold">{school.name || "Sign in"}</h2>
          <p className="mt-1 text-sm text-muted-foreground">Use the username the bursar gave you.</p>
          {idle ? <p className="mt-3 rounded-lg bg-accent px-3 py-2 text-sm">You were signed out after a quiet spell.</p> : null}
          <div className="mt-6">
            <ActionForm action={signInAction} submit="Sign in">
              <Field label="Username">
                <input name="username" autoComplete="username" className={controlClass} required />
              </Field>
              <Field label="Password">
                <input name="password" type="password" autoComplete="current-password" className={controlClass} required />
              </Field>
            </ActionForm>
          </div>
          {school.is_sample ? (
            <div className="mt-6 rounded-xl bg-muted px-3 py-3 text-sm">
              <p className="font-medium">Sample office</p>
              <ul className="mt-1 space-y-0.5 text-muted-foreground">
                <li>admin · kwese1840</li>
                <li>bursar · bursar1840</li>
                <li>teacher · teacher1840</li>
              </ul>
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
