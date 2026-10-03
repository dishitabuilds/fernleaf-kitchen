import { Injectable } from '@nestjs/common';
import { ApiError } from '../../common/api-error';
import { serializable, translateDatabaseError } from '../../common/transaction';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { CatalogueQuery, CategoryInput, DishInput, GroupsInput, MenuItemInput, OptionInput } from './catalogue.dto';

export const optionInclude = {
  allergens: { include: { reference: true } }, dietaryTags: { include: { reference: true } },
} satisfies Prisma.OptionInclude;
export const dishInclude = {
  allergens: { include: { reference: true } }, dietaryTags: { include: { reference: true } },
  groups: { orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: {
    options: { orderBy: [{ sortOrder: 'asc' }, { optionId: 'asc' }], include: { option: { include: optionInclude } } },
  } },
} satisfies Prisma.DishInclude;

function required(value: unknown, field: string): void {
  if (value === undefined || value === null || (typeof value === 'string' && !value.trim())) {
    throw new ApiError(400, 'VALIDATION_FAILED', `${field} is required.`, { [field]: ['Provide a value.'] });
  }
}
function bounds(query: CatalogueQuery) { return { skip: (query.page - 1) * query.pageSize, take: query.pageSize }; }
function active(query: CatalogueQuery) { return query.active === undefined ? {} : { active: query.active === 'true' }; }
function text(value: string | undefined) { return value === undefined ? undefined : value.trim(); }

@Injectable()
export class CatalogueService {
  constructor(private readonly prisma: PrismaService) {}

  async listDishes(query: CatalogueQuery) {
    const where: Prisma.DishWhereInput = { ...active(query), ...(query.q ? { OR: [{ name: { contains: query.q, mode: 'insensitive' } }, { sku: { contains: query.q, mode: 'insensitive' } }] } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.dish.findMany({ where, ...bounds(query), orderBy: [{ name: 'asc' }, { id: 'asc' }], include: dishInclude }),
      this.prisma.dish.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async dish(id: string) {
    const record = await this.prisma.dish.findUnique({ where: { id }, include: dishInclude });
    if (!record) throw new ApiError(404, 'DISH_NOT_FOUND', 'This dish does not exist.');
    return record;
  }
  async saveDish(id: string | undefined, input: DishInput) {
    if (!id) { required(input.sku, 'sku'); required(input.name, 'name'); required(input.costMinor, 'costMinor'); }
    if (input.name !== undefined) required(input.name, 'name');
    if (input.sku !== undefined) required(input.sku, 'sku');
    if (input.imageUrl) {
      let parsed: URL;
      try { parsed = new URL(input.imageUrl); }
      catch { throw new ApiError(400, 'IMAGE_URL_INVALID', 'Use a valid http or https image URL.'); }
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new ApiError(400, 'IMAGE_URL_INVALID', 'Use an http or https image URL.');
    }
    try {
      return await serializable(this.prisma, async (tx) => {
        if (id && !await tx.dish.findUnique({ where: { id } })) throw new ApiError(404, 'DISH_NOT_FOUND', 'This dish does not exist.');
        await this.validateReferences(tx, input.allergenIds, 'ALLERGEN');
        await this.validateReferences(tx, input.dietaryTagIds, 'DIETARY_TAG');
        if (input.stationId) await this.validateReferences(tx, [input.stationId], 'KITCHEN_STATION');
        const data = {
          sku: input.sku?.trim().toUpperCase(), name: text(input.name), description: input.description, imageUrl: input.imageUrl,
          temperature: input.temperature, costMinor: input.costMinor, stationId: input.stationId,
          minQuantity: input.minQuantity, active: input.active,
        };
        const record = id ? await tx.dish.update({ where: { id }, data }) : await tx.dish.create({ data: {
          ...data, sku: input.sku!.trim().toUpperCase(), name: input.name!.trim(), costMinor: input.costMinor!,
        } });
        if (input.allergenIds !== undefined) {
          await tx.dishAllergen.deleteMany({ where: { dishId: record.id } });
          await tx.dishAllergen.createMany({ data: input.allergenIds.map((referenceId) => ({ dishId: record.id, referenceId })) });
        }
        if (input.dietaryTagIds !== undefined) {
          await tx.dishDietaryTag.deleteMany({ where: { dishId: record.id } });
          await tx.dishDietaryTag.createMany({ data: input.dietaryTagIds.map((referenceId) => ({ dishId: record.id, referenceId })) });
        }
        return tx.dish.findUniqueOrThrow({ where: { id: record.id }, include: dishInclude });
      });
    } catch (error) { translateDatabaseError(error); }
  }
  async listOptions(query: CatalogueQuery) {
    const where: Prisma.OptionWhereInput = { ...active(query), ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.option.findMany({ where, ...bounds(query), orderBy: [{ name: 'asc' }, { id: 'asc' }], include: optionInclude }), this.prisma.option.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async option(id: string) {
    const record = await this.prisma.option.findUnique({ where: { id }, include: optionInclude });
    if (!record) throw new ApiError(404, 'OPTION_NOT_FOUND', 'This option does not exist.');
    return record;
  }
  async saveOption(id: string | undefined, input: OptionInput) {
    if (!id) { required(input.name, 'name'); required(input.costMinor, 'costMinor'); }
    if (input.name !== undefined) required(input.name, 'name');
    try {
      return await serializable(this.prisma, async (tx) => {
        if (id && !await tx.option.findUnique({ where: { id } })) throw new ApiError(404, 'OPTION_NOT_FOUND', 'This option does not exist.');
        await this.validateReferences(tx, input.allergenIds, 'ALLERGEN');
        await this.validateReferences(tx, input.dietaryTagIds, 'DIETARY_TAG');
        const data = { name: text(input.name), description: input.description, costMinor: input.costMinor, active: input.active };
        const record = id ? await tx.option.update({ where: { id }, data }) : await tx.option.create({ data: { ...data, name: input.name!.trim(), costMinor: input.costMinor! } });
        if (input.allergenIds !== undefined) {
          await tx.optionAllergen.deleteMany({ where: { optionId: record.id } });
          await tx.optionAllergen.createMany({ data: input.allergenIds.map((referenceId) => ({ optionId: record.id, referenceId })) });
        }
        if (input.dietaryTagIds !== undefined) {
          await tx.optionDietaryTag.deleteMany({ where: { optionId: record.id } });
          await tx.optionDietaryTag.createMany({ data: input.dietaryTagIds.map((referenceId) => ({ optionId: record.id, referenceId })) });
        }
        return tx.option.findUniqueOrThrow({ where: { id: record.id }, include: optionInclude });
      });
    } catch (error) { translateDatabaseError(error); }
  }
  async saveGroups(dishId: string, input: GroupsInput) {
    try {
      return await serializable(this.prisma, async (tx) => {
        if (!await tx.dish.findUnique({ where: { id: dishId } })) throw new ApiError(404, 'DISH_NOT_FOUND', 'This dish does not exist.');
        const existing = await tx.dishOptionGroup.findMany({ where: { dishId }, select: { id: true } });
        const ids = input.groups.flatMap((group) => group.id ? [group.id] : []);
        if (new Set(ids).size !== ids.length || ids.some((id) => !existing.some((group) => group.id === id))) {
          throw new ApiError(400, 'GROUP_INVALID', 'Group IDs must be unique and belong to this dish.');
        }
        const optionIds = [...new Set(input.groups.flatMap((group) => group.optionIds))];
        if (await tx.option.count({ where: { id: { in: optionIds }, active: true } }) !== optionIds.length) throw new ApiError(400, 'OPTION_INVALID', 'Every selected option must exist and be active.');
        if (input.groups.some((group) => !group.name.trim() || (group.required && group.optionIds.length === 0))) throw new ApiError(400, 'GROUP_INVALID', 'Name every group and add at least one option to required groups.');
        const removedIds = existing.filter((group) => !ids.includes(group.id)).map((group) => group.id);
        await tx.groupOption.deleteMany({ where: { groupId: { in: removedIds } } });
        await tx.dishOptionGroup.deleteMany({ where: { id: { in: removedIds } } });
        for (const inputGroup of input.groups) {
          const data = { name: inputGroup.name.trim(), required: inputGroup.required, sortOrder: inputGroup.sortOrder };
          const group = inputGroup.id ? await tx.dishOptionGroup.update({ where: { id: inputGroup.id }, data }) : await tx.dishOptionGroup.create({ data: { ...data, dishId } });
          await tx.groupOption.deleteMany({ where: { groupId: group.id } });
          await tx.groupOption.createMany({ data: inputGroup.optionIds.map((optionId, sortOrder) => ({ groupId: group.id, optionId, sortOrder })) });
        }
        return tx.dish.findUniqueOrThrow({ where: { id: dishId }, include: dishInclude });
      });
    } catch (error) { translateDatabaseError(error); }
  }
  async listCategories(query: CatalogueQuery) {
    const where: Prisma.CategoryWhereInput = { ...active(query), ...(query.q ? { name: { contains: query.q, mode: 'insensitive' } } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.category.findMany({ where, ...bounds(query), orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }] }), this.prisma.category.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async category(id: string) {
    const record = await this.prisma.category.findUnique({ where: { id } });
    if (!record) throw new ApiError(404, 'CATEGORY_NOT_FOUND', 'This category does not exist.');
    return record;
  }
  async saveCategory(id: string | undefined, input: CategoryInput) {
    if (!id || input.name !== undefined) required(input.name, 'name');
    const data = { ...input, name: text(input.name) };
    try {
      if (id) { await this.category(id); return await this.prisma.category.update({ where: { id }, data }); }
      return await this.prisma.category.create({ data: { ...data, name: input.name!.trim() } });
    } catch (error) { translateDatabaseError(error); }
  }
  async listMenuItems(query: CatalogueQuery) {
    const where: Prisma.MenuItemWhereInput = { ...active(query), ...(query.categoryId ? { categoryId: query.categoryId } : {}), ...(query.q ? { dish: { name: { contains: query.q, mode: 'insensitive' } } } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.menuItem.findMany({ where, ...bounds(query), orderBy: [{ sortOrder: 'asc' }, { id: 'asc' }], include: { category: true, dish: { include: dishInclude } } }), this.prisma.menuItem.count({ where }),
    ]);
    return { items, total, page: query.page, pageSize: query.pageSize };
  }
  async menuItem(id: string) {
    const record = await this.prisma.menuItem.findUnique({ where: { id }, include: { category: true, dish: { include: dishInclude } } });
    if (!record) throw new ApiError(404, 'MENU_ITEM_NOT_FOUND', 'This menu item does not exist.');
    return record;
  }
  async saveMenuItem(id: string | undefined, input: MenuItemInput) {
    if (!id) { required(input.categoryId, 'categoryId'); required(input.dishId, 'dishId'); }
    try {
      return await serializable(this.prisma, async (tx) => {
        if (id && !await tx.menuItem.findUnique({ where: { id } })) throw new ApiError(404, 'MENU_ITEM_NOT_FOUND', 'This menu item does not exist.');
        if (input.categoryId && !await tx.category.findUnique({ where: { id: input.categoryId } })) throw new ApiError(400, 'CATEGORY_INVALID', 'Select an existing category.');
        if (input.dishId && !await tx.dish.findUnique({ where: { id: input.dishId } })) throw new ApiError(400, 'DISH_INVALID', 'Select an existing dish.');
        const record = id ? await tx.menuItem.update({ where: { id }, data: input }) : await tx.menuItem.create({ data: { ...input, categoryId: input.categoryId!, dishId: input.dishId! } });
        return tx.menuItem.findUniqueOrThrow({ where: { id: record.id }, include: { category: true, dish: { include: dishInclude } } });
      });
    } catch (error) { translateDatabaseError(error); }
  }
  private async validateReferences(tx: Prisma.TransactionClient, ids: string[] | undefined, kind: 'ALLERGEN' | 'DIETARY_TAG' | 'KITCHEN_STATION') {
    if (ids !== undefined && await tx.referenceValue.count({ where: { id: { in: ids }, kind, active: true } }) !== ids.length) {
      throw new ApiError(400, 'REFERENCE_INVALID', `Select active ${kind.toLowerCase().replaceAll('_', ' ')} references.`);
    }
  }
}
