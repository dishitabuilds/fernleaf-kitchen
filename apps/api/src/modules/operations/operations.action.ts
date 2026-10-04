import { Injectable } from '@nestjs/common';
import type { StaffIdentity } from '@fernleaf/contracts';
import { ApiError } from '../../common/api-error';
import { serializable, translateDatabaseError } from '../../common/transaction';
import { PrismaService } from '../../database/prisma.service';
import { Prisma } from '../../generated/prisma/client';
import { fingerprint, json } from '../orders/order.mapping';

@Injectable()
export class OperationsAction {
  constructor(private readonly prisma: PrismaService) {}
  async run<T>(actor: StaffIdentity, key: string, payload: unknown,
    operation: (tx: Prisma.TransactionClient) => Promise<T>, scope?: (tx: Prisma.TransactionClient) => Promise<void>): Promise<T> {
    const payloadHash = fingerprint(payload);
    const replay = (value: { payloadHash: string; result: Prisma.JsonValue }) => {
      if (value.payloadHash !== payloadHash) throw new ApiError(409, 'ACTION_ID_REUSED', 'This action ID was used for a different request. Start a new action.');
      return value.result as unknown as T;
    };
    try {
      return await serializable(this.prisma, async (tx) => {
        // In particular, Driver ownership/today must still hold on a replay.
        if (scope) await scope(tx);
        const existing = await tx.operationalAction.findUnique({ where: { actorId_key: { actorId: actor.id, key } } });
        if (existing) return replay(existing);
        const result = await operation(tx);
        await tx.operationalAction.create({ data: { actorId: actor.id, key, payloadHash, result: json(result) } });
        return result;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        return serializable(this.prisma, async (tx) => {
          if (scope) await scope(tx);
          const existing = await tx.operationalAction.findUnique({ where: { actorId_key: { actorId: actor.id, key } } });
          if (existing) return replay(existing);
          return translateDatabaseError(error);
        });
      }
      return translateDatabaseError(error);
    }
  }
}
