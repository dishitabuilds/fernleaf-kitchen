import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/access.decorator';
import { CatalogueService } from './catalogue.service';
import { CatalogueQuery, CategoryInput, DishInput, GroupsInput, MenuItemInput, OptionInput } from './catalogue.dto';

@Controller()
@RequirePermissions('catalogue.manage')
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}
  @Get('dishes') dishes(@Query() query: CatalogueQuery) { return this.catalogue.listDishes(query); }
  @Get('dishes/:id') dish(@Param('id', ParseUUIDPipe) id: string) { return this.catalogue.dish(id); }
  @Post('dishes') createDish(@Body() input: DishInput) { return this.catalogue.saveDish(undefined, input); }
  @Patch('dishes/:id') updateDish(@Param('id', ParseUUIDPipe) id: string, @Body() input: DishInput) { return this.catalogue.saveDish(id, input); }
  @Put('dishes/:id/groups') groups(@Param('id', ParseUUIDPipe) id: string, @Body() input: GroupsInput) { return this.catalogue.saveGroups(id, input); }
  @Get('options') options(@Query() query: CatalogueQuery) { return this.catalogue.listOptions(query); }
  @Get('options/:id') option(@Param('id', ParseUUIDPipe) id: string) { return this.catalogue.option(id); }
  @Post('options') createOption(@Body() input: OptionInput) { return this.catalogue.saveOption(undefined, input); }
  @Patch('options/:id') updateOption(@Param('id', ParseUUIDPipe) id: string, @Body() input: OptionInput) { return this.catalogue.saveOption(id, input); }
  @Get('categories') categories(@Query() query: CatalogueQuery) { return this.catalogue.listCategories(query); }
  @Get('categories/:id') category(@Param('id', ParseUUIDPipe) id: string) { return this.catalogue.category(id); }
  @Post('categories') createCategory(@Body() input: CategoryInput) { return this.catalogue.saveCategory(undefined, input); }
  @Patch('categories/:id') updateCategory(@Param('id', ParseUUIDPipe) id: string, @Body() input: CategoryInput) { return this.catalogue.saveCategory(id, input); }
  @Get('menu-items') menuItems(@Query() query: CatalogueQuery) { return this.catalogue.listMenuItems(query); }
  @Get('menu-items/:id') menuItem(@Param('id', ParseUUIDPipe) id: string) { return this.catalogue.menuItem(id); }
  @Post('menu-items') createMenuItem(@Body() input: MenuItemInput) { return this.catalogue.saveMenuItem(undefined, input); }
  @Patch('menu-items/:id') updateMenuItem(@Param('id', ParseUUIDPipe) id: string, @Body() input: MenuItemInput) { return this.catalogue.saveMenuItem(id, input); }
}
