import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/access.decorator';
import { ReferenceCreateDto, ReferenceListDto, ReferencePatchDto } from '../companies/configuration.dto';
import { ReferenceDataService } from './reference-data.service';

@Controller('reference-data')
export class ReferenceDataController {
  constructor(private readonly references: ReferenceDataService) {}
  @RequirePermissions('settings.read') @Get() list(@Query() query: ReferenceListDto) { return this.references.list(query); }
  @RequirePermissions('settings.manage') @Post() create(@Body() dto: ReferenceCreateDto) { return this.references.create(dto); }
  @RequirePermissions('settings.manage') @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReferencePatchDto) { return this.references.update(id, dto); }
}
