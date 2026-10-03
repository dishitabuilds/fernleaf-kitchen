import { Body, Controller, Get, HttpCode, Patch, Post, Query, Req } from '@nestjs/common';
import type { ApiRequest } from '../../common/request';
import { RequirePermissions } from '../../common/access.decorator';
import { CutoffPreviewDto, SettingsUpdateDto } from './settings.dto';
import { SettingsService } from './settings.service';

@Controller('settings')
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}
  @RequirePermissions('settings.read')
  @Get()
  read() { return this.settings.read(); }

  @RequirePermissions('settings.manage')
  @Patch()
  update(@Body() dto: SettingsUpdateDto, @Req() request: ApiRequest) { return this.settings.update(dto, request.auth!.response.user); }

  @RequirePermissions('settings.read')
  @Get('cutoff')
  preview(@Query() dto: CutoffPreviewDto) { return this.settings.preview(dto); }

  @RequirePermissions('settings.manage')
  @Post('check-access')
  @HttpCode(200)
  checkAccess(): { allowed: true } {
    // Retain the explicit access probe used by the authentication regression suite.
    return { allowed: true };
  }
}
