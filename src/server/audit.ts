import type { ActorType, Prisma } from "@prisma/client";
import { prisma, type Tx } from "./db";

export interface Actor {
  type: ActorType;
  id: string | null;
}
export const SYSTEM: Actor = { type: "SYSTEM", id: null };

export async function audit(
  actor: Actor,
  action: string,
  opts: { targetType?: string; targetId?: string; details?: Prisma.InputJsonValue; ip?: string | null } = {},
  tx: Tx = prisma,
) {
  await tx.auditLog.create({
    data: {
      actorType: actor.type,
      actorId: actor.id,
      action,
      targetType: opts.targetType,
      targetId: opts.targetId,
      details: opts.details,
      ip: opts.ip ?? undefined,
    },
  });
}
