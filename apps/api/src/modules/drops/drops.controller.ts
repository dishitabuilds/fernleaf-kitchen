import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { RequirePermissions } from '../../common/access.decorator';
import type { ApiRequest } from '../../common/request';
import { AssignDriverDto, CorrectDropDto, DeliverDropDto, DropQueryDto, OperationalActionDto } from '../operations/operations.dto';
import { DropsService } from './drops.service';

@Controller('drops') @RequirePermissions('dispatch.read')
export class DropsController {
  constructor(private readonly drops: DropsService) {}
  @Get() list(@Query() query: DropQueryDto) { return this.drops.list(query); }
  @Get('drivers') drivers() { return this.drops.drivers(); }
  @Get(':id') read(@Param('id', ParseUUIDPipe) id: string) { return this.drops.read(id); }
  @Post(':id/assign') @HttpCode(200) @RequirePermissions('dispatch.assign')
  assign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AssignDriverDto, @Req() request: ApiRequest) { return this.drops.assign(id, dto, request.auth!.response.user); }
  @Post(':id/dispatch-ready') @HttpCode(200) @RequirePermissions('dispatch.depart')
  ready(@Param('id', ParseUUIDPipe) id: string, @Body() dto: OperationalActionDto, @Req() request: ApiRequest) { return this.drops.dispatchReady(id, dto, request.auth!.response.user); }
  @Post(':id/depart') @HttpCode(200) @RequirePermissions('dispatch.depart')
  depart(@Param('id', ParseUUIDPipe) id: string, @Body() dto: OperationalActionDto, @Req() request: ApiRequest) { return this.drops.depart(id, dto, request.auth!.response.user); }
  @Post(':id/deliver') @HttpCode(200) @RequirePermissions('deliveries.complete')
  deliver(@Param('id', ParseUUIDPipe) id: string, @Body() dto: DeliverDropDto, @Req() request: ApiRequest) { return this.drops.deliver(id, dto, request.auth!.response.user); }
  @Post(':id/correct') @HttpCode(200) @RequirePermissions('orders.override')
  correct(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CorrectDropDto, @Req() request: ApiRequest) { return this.drops.correct(id, dto, request.auth!.response.user); }
}
