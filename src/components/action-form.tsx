"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { ActionState } from "@/server/guard";

export function ActionForm({
  action,
  children,
  submit,
  variant = "default",
  className,
}: {
  action: (state: ActionState, formData: FormData) => Promise<ActionState>;
  children: React.ReactNode;
  submit: string;
  variant?: "default" | "destructive" | "outline" | "secondary" | "ghost";
  className?: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction} className={className ?? "grid gap-3"}>
      {state.error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">{state.error}</p> : null}
      {children}
      <div>
        <Button type="submit" variant={variant} disabled={pending} className="h-10">
          {pending ? "Saving…" : submit}
        </Button>
      </div>
    </form>
  );
}
