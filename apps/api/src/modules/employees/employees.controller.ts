import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/access.decorator';
import { EmployeeCreateDto, EmployeeImportDto, EmployeePatchDto, ListDto, TransferDto } from '../companies/configuration.dto';
import { EmployeesService } from './employees.service';

@RequirePermissions('employees.manage')
@Controller('employees')
export class EmployeesController {
  constructor(private readonly employees: EmployeesService) {}
  @Get() list(@Query() query: ListDto) { return this.employees.list(query); }
  // Declared before ':id' routes; responds 200 because a dry run or an all-invalid file creates nothing.
  @Post('import') @HttpCode(200) importCsv(@Body() dto: EmployeeImportDto) { return this.employees.importCsv(dto); }
  @Get(':id') read(@Param('id', ParseUUIDPipe) id: string) { return this.employees.read(id); }
  @Post() create(@Body() dto: EmployeeCreateDto) { return this.employees.create(dto); }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EmployeePatchDto) { return this.employees.update(id, dto); }
  @Post(':id/transfer') transfer(@Param('id', ParseUUIDPipe) id: string, @Body() dto: TransferDto) { return this.employees.transfer(id, dto); }
}
