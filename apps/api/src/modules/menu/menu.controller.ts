import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { RequirePermissions } from '../../common/access.decorator';
import { MenuService } from './menu.service';

@Controller('employees/:employeeId/menu')
@RequirePermissions('employees.manage', 'catalogue.manage')
export class MenuController {
  constructor(private readonly menu: MenuService) {}
  @Get() preview(@Param('employeeId', ParseUUIDPipe) employeeId: string) { return this.menu.preview(employeeId); }
  @Get('categories/:categoryId') category(@Param('employeeId', ParseUUIDPipe) employeeId: string, @Param('categoryId', ParseUUIDPipe) categoryId: string) { return this.menu.preview(employeeId, categoryId); }
}
