import { Injectable, Logger } from '@nestjs/common';
import type { CutoffPreviewResponse, SettingsResponse, StaffIdentity } from '@fernleaf/contracts';
import { ApiError } from '../../common/api-error';
import { serializable, translateDatabaseError } from '../../common/transaction';
import { PrismaService } from '../../database/prisma.service';
import { assertCalendar, calculateCutoff, isDeliveryDateAllowed } from '../../domain/calendar';
import { CutoffsService } from '../cutoffs/cutoffs.service';
import { CutoffPreviewDto, SettingsUpdateDto } from './settings.dto';

@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);
  constructor(private readonly prisma: PrismaService, private readonly cutoffs: CutoffsService) {}

  async read(): Promise<SettingsResponse> {
    const settings = await this.prisma.kitchenSettings.findUnique({ where: { id: 1 } });
    if (!settings) throw new ApiError(503, 'SETTINGS_NOT_INITIALIZED', 'Run the database seed to initialize kitchen settings.');
    return { ...settings, timezone: 'Asia/Kolkata', currency: 'USD', phase: 2 };
  }

  async update(dto: SettingsUpdateDto, actor?: StaffIdentity): Promise<SettingsResponse> {
    assertCalendar(dto);
    try {
      await serializable(this.prisma, async (tx) => {
        if (!await tx.priceTier.findFirst({ where: { id: dto.defaultPriceTierId, active: true } })) throw new ApiError(400, 'INVALID_DEFAULT_TIER', 'Select an active default price tier.');
        const { version, ...fields } = dto;
        const update = await tx.kitchenSettings.updateMany({ where: { id: 1, version }, data: { ...fields, version: { increment: 1 } } });
        if (!update.count) throw new ApiError(409, 'STALE_VERSION', 'Kitchen settings changed. Reload before saving.');
        const dates = await tx.deliveryDateCutoff.findMany({ where: { processedAt: null } });
        for (const date of dates) {
          const cutoffAt = calculateCutoff(date.deliveryDate, fields, fields.cutoffWorkingDays, fields.cutoffTime);
          await tx.deliveryDateCutoff.update({ where: { deliveryDate: date.deliveryDate }, data: {
            cutoffAt, settingsVersion: version + 1,
            policySnapshot: { timezone: 'Asia/Kolkata', workingDays: fields.workingDays, holidays: fields.holidays,
              cutoffWorkingDays: fields.cutoffWorkingDays, cutoffTime: fields.cutoffTime, settingsVersion: version + 1 },
          } });
          if (cutoffAt.getTime() === date.cutoffAt.getTime()) continue;
          const orders = await tx.order.findMany({ where: { deliveryDate: date.deliveryDate, status: { in: ['DRAFT', 'PLACED'] } }, select: { id: true } });
          for (const order of orders) {
            await tx.order.update({ where: { id: order.id }, data: { cutoffAt, version: { increment: 1 } } });
            await tx.orderEvent.create({ data: {
              orderId: order.id, actionKey: `settings:${version + 1}:cutoff`, type: 'CUTOFF_CHANGED',
              actorId: actor?.id ?? null, actorName: actor?.displayName ?? 'Kitchen settings',
              reason: 'Kitchen calendar or cutoff policy changed before this delivery date was processed.',
              details: { before: date.cutoffAt.toISOString(), after: cutoffAt.toISOString(), settingsVersion: version + 1 },
            } });
          }
        }
      });
      // Processing runs only after the policy/order updates have committed together.
      try { await this.cutoffs.scanDue(); }
      catch { this.logger.error('Cutoff catch-up after settings save failed; the minute scheduler will retry.'); }
      return this.read();
    } catch (error) { return translateDatabaseError(error); }
  }

  async preview(dto: CutoffPreviewDto): Promise<CutoffPreviewResponse> {
    const settings = await this.read();
    const persisted = await this.prisma.deliveryDateCutoff.findUnique({ where: { deliveryDate: dto.deliveryDate } });
    let allowed: boolean | null = null;
    if (dto.companyId) {
      const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
      if (!company) throw new ApiError(404, 'COMPANY_NOT_FOUND', 'This company does not exist.');
      allowed = company.active && isDeliveryDateAllowed(dto.deliveryDate, company);
    }
    return { deliveryDate: dto.deliveryDate, cutoffAt: persisted?.processedAt ? persisted.cutoffAt.toISOString() : calculateCutoff(dto.deliveryDate, settings, settings.cutoffWorkingDays, settings.cutoffTime).toISOString(), companyDeliveryAllowed: allowed, settingsVersion: persisted?.processedAt ? persisted.settingsVersion : settings.version };
  }
}
