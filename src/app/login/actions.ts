"use server";

import { redirect } from "next/navigation";
import { login } from "@/lib/auth";

function safeRedirectTarget(from: FormDataEntryValue | null): string {
  if (typeof from === "string" && from.startsWith("/") && !from.startsWith("//")) {
    return from;
  }
  return "/";
}

export async function loginAction(formData: FormData): Promise<void> {
  const email = String(formData.get("email") ?? "");
  const motDePasse = String(formData.get("motDePasse") ?? "");
  const from = safeRedirectTarget(formData.get("from"));

  const result = await login(email, motDePasse);

  if (!result.ok) {
    const params = new URLSearchParams({ error: result.error, from });
    redirect(`/login?${params.toString()}`);
  }

  redirect(from);
}
