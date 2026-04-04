import { prisma } from "./prisma";

export type ActorType = "user" | "system";

export interface LogAuditParams {
  actorType: ActorType;
  actorId?: string;
  actorLabel: string;
  companyId?: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  details: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Registra uma entrada no audit log.
 *
 * Fire-and-forget: erros são logados no console mas não propagados,
 * para não interromper o fluxo principal.
 *
 * Ações padronizadas:
 * - auth.login / auth.logout (actor_type: user)
 * - auth.invalid_signature (actor_type: system)
 * - credential.create / credential.update / credential.delete (actor_type: user)
 * - cleanup.logs / cleanup.notifications (actor_type: system)
 * - delivery.orphan_recovery (actor_type: system)
 */
export async function logAudit(params: LogAuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        actorType: params.actorType,
        actorId: params.actorId,
        actorLabel: params.actorLabel,
        companyId: params.companyId,
        action: params.action,
        resourceType: params.resourceType,
        resourceId: params.resourceId,
        details: params.details,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (error) {
    console.error("[audit] Falha ao registrar audit log:", error);
  }
}
