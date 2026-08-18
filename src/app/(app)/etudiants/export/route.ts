import { NextRequest } from "next/server";
import { requireSession } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { versCsv, reponseCsv } from "@/lib/csv";

export async function GET(request: NextRequest) {
  await requireSession();
  const q = request.nextUrl.searchParams.get("q")?.trim();

  const etudiants = await prisma.etudiant.findMany({
    where: q
      ? {
          OR: [
            { nom: { contains: q, mode: "insensitive" } },
            { prenom: { contains: q, mode: "insensitive" } },
          ],
        }
      : undefined,
    orderBy: [{ nom: "asc" }, { prenom: "asc" }],
    include: { responsables: true },
  });

  const lignes = etudiants.map((e) => [
    e.nom,
    e.prenom,
    e.civilite ?? "",
    e.dateNaissance ? e.dateNaissance.toISOString().slice(0, 10) : "",
    e.villeNaissance ?? "",
    e.telephoneMobile ?? "",
    e.telephoneFixe ?? "",
    e.email ?? "",
    e.adresse ?? "",
    e.statutInscription,
    e.responsables.map((r) => `${r.prenom} ${r.nom} (${r.lien})`).join(" / "),
  ]);

  const csv = versCsv(
    [
      "Nom",
      "Prénom",
      "Civilité",
      "Date de naissance",
      "Ville de naissance",
      "Téléphone mobile",
      "Téléphone fixe",
      "Email",
      "Adresse",
      "Statut",
      "Responsables légaux",
    ],
    lignes,
  );

  const suffixe = q ? `-${q}` : "";
  return reponseCsv(`etudiants${suffixe}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
}
