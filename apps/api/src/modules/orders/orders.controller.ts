import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import { RequirePermissions } from '../../common/access.decorator';
import type { ApiRequest } from '../../common/request';
import { CreateOrderDto, OrderQueryDto, OverrideCreateDto, OverrideDto, PlaceOrderDto, QuoteDto, ReasonDto, UpdateOrderDto } from './orders.dto';
import { OrdersService } from './orders.service';

@RequirePermissions('orders.read')
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Get() list(@Query() query: OrderQueryDto) { return this.orders.list(query); }
  @Get(':id') read(@Param('id', ParseUUIDPipe) id: string) { return this.orders.read(id); }
  @Post('quote') @RequirePermissions('orders.create')
  quote(@Body() dto: QuoteDto) { return this.orders.quote(dto); }
  @Post() @RequirePermissions('orders.create')
  create(@Body() dto: CreateOrderDto, @Req() request: ApiRequest) { return this.orders.create(dto, request.auth!.response.user); }
  @Post('override-create') @RequirePermissions('orders.override')
  overrideCreate(@Body() dto: OverrideCreateDto, @Req() request: ApiRequest) { return this.orders.overrideCreate(dto, request.auth!.response.user); }
  @Patch(':id') @RequirePermissions('orders.manage')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateOrderDto, @Req() request: ApiRequest) { return this.orders.update(id, dto, request.auth!.response.user); }
  @Post(':id/place') @RequirePermissions('orders.manage')
  place(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PlaceOrderDto, @Req() request: ApiRequest) { return this.orders.place(id, dto, request.auth!.response.user); }
  @Post(':id/cancel') @RequirePermissions('orders.manage')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @Req() request: ApiRequest) { return this.orders.cancel(id, dto, request.auth!.response.user); }
  @Post(':id/reject') @RequirePermissions('orders.manage')
  reject(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReasonDto, @Req() request: ApiRequest) { return this.orders.reject(id, dto, request.auth!.response.user); }
  @Post(':id/override') @RequirePermissions('orders.override')
  override(@Param('id', ParseUUIDPipe) id: string, @Body() dto: OverrideDto, @Req() request: ApiRequest) { return this.orders.override(id, dto, request.auth!.response.user); }
}
