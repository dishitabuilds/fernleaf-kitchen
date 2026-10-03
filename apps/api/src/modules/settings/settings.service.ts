import { Injectable } from '@nestjs/common';
import type { CutoffPreviewResponse, SettingsResponse } from '@fernleaf/contracts';
import { ApiError } from '../../common/api-error';
import { serializable, translateDatabaseError } from '../../common/transaction';
import { PrismaService } from '../../database/prisma.service';
import { assertCalendar, calculateCutoff, isDeliveryDateAllowed } from '../../domain/calendar';
import { CutoffPreviewDto, SettingsUpdateDto } from './settings.dto';

@Injectable()
export class SettingsService {
  constructor(private readonly prisma: PrismaService) {}

  async read(): Promise<SettingsResponse> {
    const settings = await this.prisma.kitchenSettings.findUnique({ where: { id: 1 } });
    if (!settings) throw new ApiError(503, 'SETTINGS_NOT_INITIALIZED', 'Run the database seed to initialize kitchen settings.');
    return { ...settings, timezone: 'Asia/Kolkata', currency: 'USD', phase: 1 };
  }

  async update(dto: SettingsUpdateDto): Promise<SettingsResponse> {
    assertCalendar(dto);
    try {
      await serializable(this.prisma, async (tx) => {
        if (!await tx.priceTier.findFirst({ where: { id: dto.defaultPriceTierId, active: true } })) throw new ApiError(400, 'INVALID_DEFAULT_TIER', 'Select an active default price tier.');
        const { version, ...fields } = dto;
        const update = await tx.kitchenSettings.updateMany({ where: { id: 1, version }, data: { ...fields, version: { increment: 1 } } });
        if (!update.count) throw new ApiError(409, 'STALE_VERSION', 'Kitchen settings changed. Reload before saving.');
      });
      return this.read();
    } catch (error) { return translateDatabaseError(error); }
  }

  async preview(dto: CutoffPreviewDto): Promise<CutoffPreviewResponse> {
    const settings = await this.read();
    let allowed: boolean | null = null;
    if (dto.companyId) {
      const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
      if (!company) throw new ApiError(404, 'COMPANY_NOT_FOUND', 'This company does not exist.');
      allowed = company.active && isDeliveryDateAllowed(dto.deliveryDate, company);
    }
    return { deliveryDate: dto.deliveryDate, cutoffAt: calculateCutoff(dto.deliveryDate, settings, settings.cutoffWorkingDays, settings.cutoffTime).toISOString(), companyDeliveryAllowed: allowed, settingsVersion: settings.version };
  }
}
