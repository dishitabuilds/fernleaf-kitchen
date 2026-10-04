import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { RequirePermissions } from '../../common/access.decorator';
import type { ApiRequest } from '../../common/request';
import { DropsService } from '../drops/drops.service';
import { DeliverDropDto, DriverQueryDto } from '../operations/operations.dto';

@Controller('driver') @RequirePermissions('deliveries.read.own')
export class DriverController {
  constructor(private readonly drops: DropsService) {}
  @Get('today') today(@Query() query: DriverQueryDto, @Req() request: ApiRequest) { return this.drops.driverToday(query, request.auth!.response.user); }
  @Get('drops/:id') read(@Param('id', ParseUUIDPipe) id: string, @Req() request: ApiRequest) { return this.drops.read(id, request.auth!.response.user); }
  @Post('drops/:id/deliver') @HttpCode(200) @RequirePermissions('deliveries.complete.own')
  deliver(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DeliverDropDto, @Req() request: ApiRequest) { return this.drops.deliver(id, dto, request.auth!.response.user, true); }
}
