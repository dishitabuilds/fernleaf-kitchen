import { Injectable } from '@nestjs/common';
import type { CompanyAddressResponse, CompanyResponse, DriverChoiceResponse, EmployeeResponse, PageResponse } from '@fernleaf/contracts';
import { ApiError } from '../../common/api-error';
import { serializable, translateDatabaseError } from '../../common/transaction';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { assertCalendar, assertLocalTime } from '../../domain/calendar';
import { AddressPatchDto, CompanyCreateDto, CompanyPatchDto, ListDto } from './configuration.dto';
import { normalizeCompanyDomain, rejectUnexpectedNulls, requiredString, requiredVersion } from './configuration.validation';

const companyInclude = {
  domains: true, addresses: { orderBy: { label: 'asc' as const } },
  employees: { include: { allergens: true, dietaryTags: true }, orderBy: { name: 'asc' as const } },
  hiddenCategories: true, hiddenItems: true,
} as const;
type LoadedCompany = Prisma.CompanyGetPayload<{ include: typeof companyInclude }>;

export function employeeResponse(employee: Prisma.EmployeeGetPayload<{ include: { allergens: true; dietaryTags: true } }>): EmployeeResponse {
  const { allergens, dietaryTags, ...fields } = employee;
  return { ...fields, allergenIds: allergens.map((allergen) => allergen.referenceId), dietaryTagIds: dietaryTags.map((tag) => tag.referenceId) };
}
function companyResponse(company: LoadedCompany): CompanyResponse {
  const { domains, employees, hiddenCategories, hiddenItems, ...fields } = company;
  return { ...fields, domains: domains.map((domain) => domain.domain), employees: employees.map(employeeResponse),
    hiddenCategoryIds: hiddenCategories.map((category) => category.categoryId), hiddenMenuItemIds: hiddenItems.map((item) => item.menuItemId) };
}

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListDto): Promise<PageResponse<CompanyResponse>> {
    const where: Prisma.CompanyWhereInput = query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' } }, { domains: { some: { domain: { contains: query.search, mode: 'insensitive' } } } }] } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.company.findMany({ where, include: companyInclude, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.company.count({ where }),
    ]);
    return { items: items.map(companyResponse), total, page: query.page, pageSize: query.pageSize };
  }

  async read(id: string): Promise<CompanyResponse> {
    const company = await this.prisma.company.findUnique({ where: { id }, include: companyInclude });
    if (!company) throw new ApiError(404, 'COMPANY_NOT_FOUND', 'This company does not exist.');
    return companyResponse(company);
  }

  async drivers(): Promise<DriverChoiceResponse[]> {
    return this.prisma.staffUser.findMany({ where: { role: 'DRIVER', active: true }, select: { id: true, displayName: true }, orderBy: [{ displayName: 'asc' }, { id: 'asc' }] });
  }

  async create(dto: CompanyCreateDto): Promise<CompanyResponse> {
    rejectUnexpectedNulls(dto, ['phone', 'priceTierId', 'packagingId', 'defaultDriverId']);
    if (!dto.owner || !dto.address) throw new ApiError(400, 'COMPANY_SETUP_REQUIRED', 'Create a company with its initial address and employee owner.');
    if (dto.address.active === false) throw new ApiError(400, 'INVALID_DEFAULT_ADDRESS', 'The initial default address must be active.');
    if (dto.ownerEmployeeId || dto.defaultAddressId || dto.hiddenCategoryIds || dto.hiddenMenuItemIds || dto.version) throw new ApiError(400, 'VALIDATION_FAILED', 'Set existing relationships after company creation.');
    const data = {
      name: requiredString(dto.name, 'name'), billingName: requiredString(dto.billingName, 'billingName'),
      billingEmail: requiredString(dto.billingEmail, 'billingEmail'), billingAddress: requiredString(dto.billingAddress, 'billingAddress'),
      billingContactName: requiredString(dto.billingContactName, 'billingContactName'), phone: dto.phone ?? null,
      active: dto.active ?? true, priceTierId: dto.priceTierId ?? null, deliveryTime: requiredString(dto.deliveryTime, 'deliveryTime'),
      deliveryMinutes: dto.deliveryMinutes ?? 30, packagingId: dto.packagingId ?? null, defaultDriverId: dto.defaultDriverId ?? null,
      driverInstructions: dto.driverInstructions ?? '', workingDays: dto.workingDays ?? [1, 2, 3, 4, 5], holidays: dto.holidays ?? [],
    };
    assertCalendar(data); assertLocalTime(data.deliveryTime);
    try {
      const id = await serializable(this.prisma, async (tx) => {
        await this.validateDefaults(tx, data);
        const domains = await this.validateDomains(tx, dto.domains ?? []);
        const company = await tx.company.create({ data: { ...data, domains: { create: domains.map((domain) => ({ domain })) } } });
        const owner = await tx.employee.create({ data: { companyId: company.id, name: dto.owner.name, email: dto.owner.email } });
        const address = await tx.companyAddress.create({ data: { ...this.addressData(dto.address), companyId: company.id } });
        await tx.company.update({ where: { id: company.id }, data: { ownerEmployeeId: owner.id, defaultAddressId: address.id } });
        return company.id;
      });
      return this.read(id);
    } catch (error) { return translateDatabaseError(error); }
  }

  async update(id: string, dto: CompanyPatchDto): Promise<CompanyResponse> {
    rejectUnexpectedNulls(dto, ['phone', 'priceTierId', 'packagingId', 'defaultDriverId']);
    const version = requiredVersion(dto.version);
    const { domains, hiddenCategoryIds, hiddenMenuItemIds, version: _version, ...fields } = dto;
    void _version;
    try {
      await serializable(this.prisma, async (tx) => {
        const company = await tx.company.findUnique({ where: { id } });
        if (!company) throw new ApiError(404, 'COMPANY_NOT_FOUND', 'This company does not exist.');
        if (company.version !== version) throw new ApiError(409, 'STALE_VERSION', 'The company changed. Reload before saving.');
        assertCalendar({ workingDays: dto.workingDays ?? company.workingDays, holidays: dto.holidays ?? company.holidays });
        if (dto.deliveryTime !== undefined) assertLocalTime(dto.deliveryTime);
        await this.validateDefaults(tx, fields);
        if (dto.ownerEmployeeId) {
          const owner = await tx.employee.findFirst({ where: { id: dto.ownerEmployeeId, companyId: id, active: true } });
          if (!owner) throw new ApiError(400, 'INVALID_COMPANY_OWNER', 'The owner must be an active employee of this company.');
        }
        if (dto.defaultAddressId) {
          const address = await tx.companyAddress.findFirst({ where: { id: dto.defaultAddressId, companyId: id, active: true } });
          if (!address) throw new ApiError(400, 'INVALID_DEFAULT_ADDRESS', 'The default must be an active address of this company.');
        }
        if (domains) {
          const normalized = await this.validateDomains(tx, domains);
          await tx.companyDomain.deleteMany({ where: { companyId: id } });
          await tx.companyDomain.createMany({ data: normalized.map((domain) => ({ companyId: id, domain })) });
        }
        if (hiddenCategoryIds) {
          if (await tx.category.count({ where: { id: { in: hiddenCategoryIds } } }) !== hiddenCategoryIds.length) throw new ApiError(400, 'INVALID_HIDDEN_CATEGORY', 'Select existing categories.');
          await tx.companyHiddenCategory.deleteMany({ where: { companyId: id } });
          await tx.companyHiddenCategory.createMany({ data: hiddenCategoryIds.map((categoryId) => ({ companyId: id, categoryId })) });
        }
        if (hiddenMenuItemIds) {
          if (await tx.menuItem.count({ where: { id: { in: hiddenMenuItemIds } } }) !== hiddenMenuItemIds.length) throw new ApiError(400, 'INVALID_HIDDEN_MENU_ITEM', 'Select existing menu items.');
          await tx.companyHiddenMenuItem.deleteMany({ where: { companyId: id } });
          await tx.companyHiddenMenuItem.createMany({ data: hiddenMenuItemIds.map((menuItemId) => ({ companyId: id, menuItemId })) });
        }
        const result = await tx.company.updateMany({ where: { id, version }, data: { ...fields, version: { increment: 1 } } });
        if (!result.count) throw new ApiError(409, 'STALE_VERSION', 'The company changed. Reload before saving.');
      });
      return this.read(id);
    } catch (error) { return translateDatabaseError(error); }
  }

  async createAddress(companyId: string, dto: AddressPatchDto): Promise<CompanyAddressResponse> {
    try {
      return await serializable(this.prisma, async (tx) => {
        if (!await tx.company.findUnique({ where: { id: companyId } })) throw new ApiError(404, 'COMPANY_NOT_FOUND', 'This company does not exist.');
        return tx.companyAddress.create({ data: { ...this.addressData(dto), companyId } });
      });
    } catch (error) { return translateDatabaseError(error); }
  }

  async updateAddress(companyId: string, id: string, dto: AddressPatchDto): Promise<CompanyAddressResponse> {
    rejectUnexpectedNulls(dto, ['line2']);
    try {
      return await serializable(this.prisma, async (tx) => {
        const address = await tx.companyAddress.findFirst({ where: { id, companyId } });
        if (!address) throw new ApiError(404, 'ADDRESS_NOT_FOUND', 'This address does not belong to the company.');
        if (dto.active === false && await tx.company.count({ where: { id: companyId, defaultAddressId: id } })) throw new ApiError(409, 'DEFAULT_ADDRESS_IN_USE', 'Choose another default address before retiring this address.');
        return tx.companyAddress.update({ where: { id }, data: dto });
      });
    } catch (error) { return translateDatabaseError(error); }
  }

  private addressData(dto: AddressPatchDto) {
    rejectUnexpectedNulls(dto, ['line2']);
    return { label: requiredString(dto.label, 'address.label'), line1: requiredString(dto.line1, 'address.line1'), line2: dto.line2 ?? null,
      city: requiredString(dto.city, 'address.city'), region: requiredString(dto.region, 'address.region'), postalCode: requiredString(dto.postalCode, 'address.postalCode'), country: requiredString(dto.country, 'address.country'), active: dto.active ?? true };
  }

  private async validateDomains(tx: Prisma.TransactionClient, domains: string[]): Promise<string[]> {
    if (!domains.length) throw new ApiError(400, 'COMPANY_DOMAIN_REQUIRED', 'Add at least one company email domain.');
    const normalized = domains.map(normalizeCompanyDomain);
    if (new Set(normalized).size !== normalized.length) throw new ApiError(400, 'DUPLICATE_DOMAIN', 'List each normalized domain once.');
    const denylist = await tx.referenceValue.findMany({ where: { kind: 'PUBLIC_EMAIL_DOMAIN', active: true }, select: { name: true } });
    const publicDomains = new Set(denylist.map((reference) => normalizeCompanyDomain(reference.name)));
    if (normalized.some((domain) => publicDomains.has(domain))) throw new ApiError(400, 'PUBLIC_COMPANY_DOMAIN', 'Public email-provider domains cannot identify a company.');
    return normalized;
  }

  private async validateDefaults(tx: Prisma.TransactionClient, fields: { priceTierId?: string | null; packagingId?: string | null; defaultDriverId?: string | null }): Promise<void> {
    if (fields.priceTierId && !await tx.priceTier.findFirst({ where: { id: fields.priceTierId, active: true } })) throw new ApiError(400, 'INVALID_PRICE_TIER', 'Choose an active price tier.');
    if (fields.packagingId && !await tx.referenceValue.findFirst({ where: { id: fields.packagingId, kind: 'PACKAGING_TYPE', active: true } })) throw new ApiError(400, 'INVALID_PACKAGING', 'Choose active packaging.');
    if (fields.defaultDriverId && !await tx.staffUser.findFirst({ where: { id: fields.defaultDriverId, role: 'DRIVER', active: true } })) throw new ApiError(400, 'INVALID_DRIVER', 'Choose an active Driver account.');
  }
}
