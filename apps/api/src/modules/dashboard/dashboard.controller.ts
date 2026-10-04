import { Controller, Get, Query, Req } from '@nestjs/common';
import { RequirePermissions } from '../../common/access.decorator';
import type { ApiRequest } from '../../common/request';
import { DashboardService } from './dashboard.service';
import { DashboardQueryDto } from './dashboard.dto';

@RequirePermissions('dashboard.read')
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get()
  read(@Req() request: ApiRequest, @Query() query: DashboardQueryDto) {
    return this.dashboard.read(request.auth!.response.user, query);
  }
}
