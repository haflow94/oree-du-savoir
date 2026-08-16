"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function creerCoursAction(formData: FormData): Promise<void> {
  await requireSession();
  const nom = String(formData.get("nom") ?? "").trim();
  if (!nom) return;

  await prisma.cours.create({ data: { nom } });
  revalidatePath("/classes");
  revalidatePath("/classes/nouveau");
}
