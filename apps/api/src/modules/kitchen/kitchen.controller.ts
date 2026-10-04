import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { RequirePermissions } from '../../common/access.decorator';
import type { ApiRequest } from '../../common/request';
import { ForceCompleteDto, KitchenQueryDto, OperationalActionDto } from '../operations/operations.dto';
import { KitchenService } from './kitchen.service';

@Controller('kitchen') @RequirePermissions('prep.read')
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}
  @Get() board(@Query() query: KitchenQueryDto) { return this.kitchen.board(query); }
  @Get('orders/:id') read(@Param('id', ParseUUIDPipe) id: string) { return this.kitchen.readOrder(id); }
  @Post('orders/:id/force-complete') @HttpCode(200) @RequirePermissions('prep.force-complete')
  force(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ForceCompleteDto, @Req() request: ApiRequest) {
    return this.kitchen.forceComplete(id, dto, request.auth!.response.user);
  }
}
@Controller('prep-units')
export class PrepUnitsController {
  constructor(private readonly kitchen: KitchenService) {}
  @Post(':id/start') @HttpCode(200) @RequirePermissions('prep.start')
  start(@Param('id', ParseUUIDPipe) id: string, @Body() dto: OperationalActionDto, @Req() request: ApiRequest) {
    return this.kitchen.start(id, dto, request.auth!.response.user);
  }
  @Post(':id/complete') @HttpCode(200) @RequirePermissions('prep.complete')
  complete(@Param('id', ParseUUIDPipe) id: string, @Body() dto: OperationalActionDto, @Req() request: ApiRequest) {
    return this.kitchen.complete(id, dto, request.auth!.response.user);
  }
}
