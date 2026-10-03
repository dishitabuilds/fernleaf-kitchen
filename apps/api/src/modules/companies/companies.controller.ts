import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/access.decorator';
import { AddressPatchDto, CompanyCreateDto, CompanyPatchDto, ListDto } from './configuration.dto';
import { CompaniesService } from './companies.service';

@RequirePermissions('companies.manage')
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companies: CompaniesService) {}
  @Get() list(@Query() query: ListDto) { return this.companies.list(query); }
  @Get('drivers') drivers() { return this.companies.drivers(); }
  @Get(':id') read(@Param('id', ParseUUIDPipe) id: string) { return this.companies.read(id); }
  @Post() create(@Body() dto: CompanyCreateDto) { return this.companies.create(dto); }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CompanyPatchDto) { return this.companies.update(id, dto); }
  @Post(':id/addresses') createAddress(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AddressPatchDto) { return this.companies.createAddress(id, dto); }
  @Patch(':id/addresses/:addressId') updateAddress(@Param('id', ParseUUIDPipe) id: string, @Param('addressId', ParseUUIDPipe) addressId: string, @Body() dto: AddressPatchDto) { return this.companies.updateAddress(id, addressId, dto); }
}
