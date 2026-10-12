import { unstable_rethrow } from "next/navigation";
import { AppError } from "@/lib/errors";

export type ActionState = { error?: string };

export function errorText(error: unknown) {
  unstable_rethrow(error);
  if (error instanceof AppError) return error.message;
  console.error(error);
  return "That did not save. Check the figures and try again.";
}

export function field(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

export function checked(formData: FormData, name: string) {
  return formData.get(name) === "on" || formData.get(name) === "1";
}
