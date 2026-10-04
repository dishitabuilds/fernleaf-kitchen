import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/access.decorator';
import { StaffService } from './staff.service';
import { CreateStaffDto, StaffQueryDto, UpdateStaffDto } from './staff.dto';

@RequirePermissions('staff.manage')
@Controller('staff')
export class StaffController {
  constructor(private readonly staff: StaffService) {}

  @Get()
  list(@Query() query: StaffQueryDto) { return this.staff.list(query); }

  @Get(':id')
  read(@Param('id', ParseUUIDPipe) id: string) { return this.staff.read(id); }

  @Post()
  create(@Body() dto: CreateStaffDto) { return this.staff.create(dto); }

  @Patch(':id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateStaffDto) { return this.staff.update(id, dto); }
}
