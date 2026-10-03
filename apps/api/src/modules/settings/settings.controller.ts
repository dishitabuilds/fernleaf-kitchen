import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { SettingsResponse } from '@fernleaf/contracts';
import { RequirePermissions } from '../../common/access.decorator';

@Controller('settings')
export class SettingsController {
  @RequirePermissions('settings.read')
  @Get()
  read(): SettingsResponse {
    return { timezone: 'Asia/Kolkata', currency: 'USD', phase: 0 };
  }

  @RequirePermissions('settings.manage')
  @Post('check-access')
  @HttpCode(200)
  checkAccess(): { allowed: true } {
    // Phase 0 proves the mutation boundary; editable domain settings belong to Phase 1.
    return { allowed: true };
  }
}
