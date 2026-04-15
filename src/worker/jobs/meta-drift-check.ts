import { prisma } from "@/lib/prisma";
import { verifyMetaSubscriptionCore } from "@/lib/actions/meta-subscription";

/**
 * Drift check diário das Meta subscriptions.
 * Itera empresas com metaSubscriptionStatus=active e chama o core
 * verificador como ator "system", com throttle de 1 req/s para
 * respeitar rate limits da Graph API.
 */
export async function runMetaDriftCheck(): Promise<void> {
  const companies = await prisma.companyCredential.findMany({
    where: { metaSubscriptionStatus: "active" },
    select: { companyId: true },
  });

  console.log(
    `[meta-drift] Iniciando drift check para ${companies.length} empresa(s) ativa(s)`
  );

  for (const { companyId } of companies) {
    try {
      await verifyMetaSubscriptionCore(companyId, { actor: "system" });
    } catch (e) {
      console.error("[meta-drift]", companyId, e);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }

  console.log("[meta-drift] Drift check concluido");
}
