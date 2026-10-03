import { Injectable } from '@nestjs/common';
import type { EmployeeMenuPreview, MenuDiagnostic, MenuPreviewDish } from '@fernleaf/contracts';
import { ApiError } from '../../common/api-error';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { chooseTier } from '../../domain/pricing';
import { dishInclude } from '../catalogue/catalogue.service';
import { readPriceContext, resolveItemPrice } from '../pricing/pricing.service';

@Injectable()
export class MenuService {
  constructor(private readonly prisma: PrismaService) {}

  async preview(employeeId: string, directCategoryId?: string): Promise<EmployeeMenuPreview> {
    return this.prisma.$transaction(
      (tx) => this.previewInTransaction(tx, employeeId, directCategoryId),
      { isolationLevel: 'RepeatableRead' },
    );
  }

  // Orders reuse this resolver in their own transaction so menu and quote data agree.
  async previewInTransaction(tx: Prisma.TransactionClient, employeeId: string, directCategoryId?: string): Promise<EmployeeMenuPreview> {
    const employee = await tx.employee.findUnique({ where: { id: employeeId }, include: {
      allergens: { include: { reference: true } }, dietaryTags: { include: { reference: true } },
      company: { include: { hiddenCategories: true, hiddenItems: true } },
    } });
    if (!employee) throw new ApiError(404, 'EMPLOYEE_NOT_FOUND', 'This employee does not exist.');
    if (!employee.active || !employee.company.active) throw new ApiError(400, 'EMPLOYEE_INACTIVE', 'Menu previews require an active employee and company.');
    const settings = await tx.kitchenSettings.findUnique({ where: { id: 1 } });
    if (!settings) throw new ApiError(409, 'SETTINGS_MISSING', 'Seed the kitchen settings before previewing a menu.');
    const tierId = chooseTier(employee.company.priceTierId, settings.defaultPriceTierId);
    const context = await readPriceContext(tx);
    const categories = await tx.category.findMany({
      ...(directCategoryId ? { where: { id: directCategoryId } } : {}),
      orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: {
        items: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { dish: { include: dishInclude } } },
      },
    });
    if (directCategoryId && categories.length === 0) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'This category does not exist.');
    const diagnostics: MenuDiagnostic[] = [];
    const result: EmployeeMenuPreview = { employeeId, companyId: employee.companyId, tierId, currency: 'USD', categories: [], diagnostics };
    const allergyIds = new Set(employee.allergens.map((entry) => entry.referenceId));
    const hiddenCategoryIds = new Set(employee.company.hiddenCategories.map((entry) => entry.categoryId));
    const hiddenItemIds = new Set(employee.company.hiddenItems.map((entry) => entry.menuItemId));
    for (const category of categories) {
      const output = { id: category.id, name: category.name, secret: category.secret, dishes: [] as MenuPreviewDish[] };
      for (const item of category.items) {
        const dish = item.dish;
        const omit = (reason: string) => diagnostics.push({ menuItemId: item.id, dishId: dish.id, dishName: dish.name, reason });
        if (!category.active) { omit('CATEGORY_INACTIVE'); continue; }
        if (hiddenCategoryIds.has(category.id)) { omit('CATEGORY_HIDDEN'); continue; }
        if (category.secret && !directCategoryId) { omit('SECRET_DIRECT_LINK_ONLY'); continue; }
        if (!item.active) { omit('MENU_ITEM_INACTIVE'); continue; }
        if (hiddenItemIds.has(item.id)) { omit('MENU_ITEM_HIDDEN'); continue; }
        if (!dish.active) { omit('DISH_INACTIVE'); continue; }
        const price = resolveItemPrice(context, tierId, 'DISH', dish.id, dish.costMinor);
        if (price.amountMinor === null) { omit('DISH_PRICE_MISSING'); continue; }
        const groups: MenuPreviewDish['groups'] = [];
        let invalidRequiredGroup = false;
        for (const group of dish.groups) {
          const outputGroup: MenuPreviewDish['groups'][number] = { id: group.id, name: group.name, required: group.required, options: [] };
          for (const groupOption of group.options) {
            const option = groupOption.option;
            if (!option.active) continue;
            const optionPrice = resolveItemPrice(context, tierId, 'OPTION', option.id, option.costMinor);
            if (optionPrice.amountMinor === null) continue;
            outputGroup.options.push({ id: option.id, name: option.name, priceMinor: optionPrice.amountMinor, source: optionPrice.source,
              allergyWarnings: option.allergens.filter((entry) => allergyIds.has(entry.referenceId)).map((entry) => entry.reference.name),
              dietaryTags: option.dietaryTags.map((entry) => entry.reference.name),
            });
          }
          if (group.required && outputGroup.options.length === 0) invalidRequiredGroup = true;
          groups.push(outputGroup);
        }
        if (invalidRequiredGroup) { omit('REQUIRED_GROUP_NO_PRICED_OPTION'); continue; }
        output.dishes.push({ menuItemId: item.id, dishId: dish.id, sku: dish.sku, name: dish.name, description: dish.description, imageUrl: dish.imageUrl,
          priceMinor: price.amountMinor, source: price.source, minQuantity: dish.minQuantity,
          allergyWarnings: dish.allergens.filter((entry) => allergyIds.has(entry.referenceId)).map((entry) => entry.reference.name),
          dietaryTags: dish.dietaryTags.map((entry) => entry.reference.name), groups,
        });
      }
      if (output.dishes.length) result.categories.push(output);
    }
    return result;
  }
}
