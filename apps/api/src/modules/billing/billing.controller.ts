import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/access.decorator';
import type { ApiRequest } from '../../common/request';
import { Req } from '@nestjs/common';
import { BillingService } from './billing.service';
import { CreateCreditDto, CreateInvoiceDto, InvoiceQueryDto, PayInvoiceDto } from './billing.dto';

@RequirePermissions('billing.manage')
@Controller('billing')
export class BillingController {
  constructor(private readonly billing: BillingService) {}

  @Get('invoices')
  list(@Query() query: InvoiceQueryDto) { return this.billing.list(query); }

  @Get('invoices/:id')
  read(@Param('id', ParseUUIDPipe) id: string) { return this.billing.read(id); }

  @Get('companies/:id/uninvoiced')
  uninvoiced(@Param('id', ParseUUIDPipe) companyId: string) { return this.billing.uninvoicedOrders(companyId); }

  @Post('invoices')
  create(@Body() dto: CreateInvoiceDto, @Req() request: ApiRequest) {
    return this.billing.createInvoice(dto, request.auth!.response.user);
  }

  @Post('invoices/:id/pay')
  pay(@Param('id', ParseUUIDPipe) id: string, @Body() dto: PayInvoiceDto, @Req() request: ApiRequest) {
    return this.billing.payInvoice(id, dto, request.auth!.response.user);
  }

  @Post('invoices/:id/credit')
  credit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateCreditDto, @Req() request: ApiRequest) {
    return this.billing.createCredit(id, dto, request.auth!.response.user);
  }
}
