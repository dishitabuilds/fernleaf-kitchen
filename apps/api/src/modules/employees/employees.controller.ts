import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/access.decorator';
import { EmployeeCreateDto, EmployeePatchDto, ListDto, TransferDto } from '../companies/configuration.dto';
import { EmployeesService } from './employees.service';

@RequirePermissions('employees.manage')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}
  @Get() list(@Query() query: ListDto) { return this.employees.list(query); }
  @Get(':id') read(@Param('id', ParseUUIDPipe) id: string) { return this.employees.read(id); }
  @Post() create(@Body() dto: EmployeeCreateDto) { return this.employees.create(dto); }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EmployeePatchDto) { return this.employees.update(id, dto); }
  @Post(':id/transfer') transfer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TransferDto) { return this.employees.transfer(id, dto); }
}
