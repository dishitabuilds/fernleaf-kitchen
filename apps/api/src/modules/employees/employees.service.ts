import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { EmployeeImportResult, EmployeeResponse, PageResponse } from '@fernleaf/contracts';
import { ApiError } from '../../common/api-error';
import { serializable, translateDatabaseError } from '../../common/transaction';
import { PrismaService } from '../../database/prisma.service';
import type { Prisma } from '../../generated/prisma/client';
import { employeeResponse } from '../companies/companies.service';
import { EmployeeCreateDto, EmployeeImportDto, EmployeePatchDto, ListDto, TransferDto } from '../companies/configuration.dto';
import { importSummary, planEmployeeImport } from './employee-import';
import { rejectUnexpectedNulls, requiredString } from '../companies/configuration.validation';

const employeeInclude = { allergens: true, dietaryTags: true } as const;

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ListDto): Promise<PageResponse<EmployeeResponse>> {
    const where: Prisma.EmployeeWhereInput = { ...(query.companyId ? { companyId: query.companyId } : {}),
      ...(query.search ? { OR: [{ name: { contains: query.search, mode: 'insensitive' as const } }, { email: { contains: query.search, mode: 'insensitive' as const } }] } : {}) };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.employee.findMany({ where, include: employeeInclude, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      this.prisma.employee.count({ where }),
    ]);
    return { items: items.map(employeeResponse), total, page: query.page, pageSize: query.pageSize };
  }

  async read(id: string): Promise<EmployeeResponse> {
    const employee = await this.prisma.employee.findUnique({ where: { id }, include: employeeInclude });
    if (!employee) throw new ApiError(404, 'EMPLOYEE_NOT_FOUND', 'This employee does not exist.');
    return employeeResponse(employee);
  }

  async create(dto: EmployeeCreateDto): Promise<EmployeeResponse> {
    rejectUnexpectedNulls(dto, ['phone']);
    const name = requiredString(dto.name, 'name'), email = requiredString(dto.email, 'email');
    const { allergenIds, dietaryTagIds, ...fields } = dto;
    try {
      const id = await serializable(this.prisma, async (tx) => {
        if (!await tx.company.findFirst({ where: { id: dto.companyId, active: true } })) throw new ApiError(400, 'INVALID_COMPANY', 'Choose an active company.');
        await this.validateReferences(tx, allergenIds, dietaryTagIds);
        const employee = await tx.employee.create({ data: { ...fields, name, email,
          allergens: { create: (allergenIds ?? []).map((referenceId) => ({ referenceId })) },
          dietaryTags: { create: (dietaryTagIds ?? []).map((referenceId) => ({ referenceId })) },
        } });
        return employee.id;
      });
      return this.read(id);
    } catch (error) { return translateDatabaseError(error); }
  }

  async update(id: string, dto: EmployeePatchDto): Promise<EmployeeResponse> {
    rejectUnexpectedNulls(dto, ['phone']);
    const { allergenIds, dietaryTagIds, ...fields } = dto;
    try {
      await serializable(this.prisma, async (tx) => {
        const employee = await tx.employee.findUnique({ where: { id } });
        if (!employee) throw new ApiError(404, 'EMPLOYEE_NOT_FOUND', 'This employee does not exist.');
        if (dto.active === false && await tx.company.count({ where: { ownerEmployeeId: id } })) throw new ApiError(409, 'COMPANY_OWNER_IN_USE', 'Choose a replacement company owner before retiring this employee.');
        await this.validateReferences(tx, allergenIds, dietaryTagIds);
        if (allergenIds) {
          await tx.employeeAllergen.deleteMany({ where: { employeeId: id } });
          await tx.employeeAllergen.createMany({ data: allergenIds.map((referenceId) => ({ employeeId: id, referenceId })) });
        }
        if (dietaryTagIds) {
          await tx.employeeDietaryTag.deleteMany({ where: { employeeId: id } });
          await tx.employeeDietaryTag.createMany({ data: dietaryTagIds.map((referenceId) => ({ employeeId: id, referenceId })) });
        }
        await tx.employee.update({ where: { id }, data: fields });
      });
      return this.read(id);
    } catch (error) { return translateDatabaseError(error); }
  }

  async transfer(id: string, dto: TransferDto): Promise<EmployeeResponse> {
    rejectUnexpectedNulls(dto);
    try {
      await serializable(this.prisma, async (tx) => {
        const employee = await tx.employee.findUnique({ where: { id } });
        if (!employee) throw new ApiError(404, 'EMPLOYEE_NOT_FOUND', 'This employee does not exist.');
        if (employee.companyId === dto.companyId) throw new ApiError(400, 'SAME_COMPANY', 'Choose a different company for the transfer.');
        if (!await tx.company.findFirst({ where: { id: dto.companyId, active: true } })) throw new ApiError(400, 'INVALID_COMPANY', 'Choose an active target company.');
        const sourceCompany = await tx.company.findUniqueOrThrow({ where: { id: employee.companyId } });
        if (sourceCompany.ownerEmployeeId === employee.id) {
          if (!dto.replacementOwnerId || dto.replacementOwnerId === id) throw new ApiError(409, 'REPLACEMENT_OWNER_REQUIRED', 'Choose another active employee as owner of the source company before this transfer.');
          const replacement = await tx.employee.findFirst({ where: { id: dto.replacementOwnerId, companyId: employee.companyId, active: true } });
          if (!replacement) throw new ApiError(400, 'INVALID_REPLACEMENT_OWNER', 'The replacement owner must be an active employee of the source company.');
          await tx.company.update({ where: { id: sourceCompany.id }, data: { ownerEmployeeId: replacement.id, version: { increment: 1 } } });
        } else if (dto.replacementOwnerId) throw new ApiError(400, 'REPLACEMENT_NOT_NEEDED', 'This employee is not the source company owner.');
        // Company is deliberately a live employee attribute. Phase 2 purchase snapshots capture their own company.
        await tx.employee.update({ where: { id }, data: { companyId: dto.companyId } });
      });
      return this.read(id);
    } catch (error) { return translateDatabaseError(error); }
  }

  /** Bulk-create a company's employees from CSV; invalid rows are reported per line and never block valid ones. */
  async importCsv(dto: EmployeeImportDto): Promise<EmployeeImportResult> {
    const dryRun = dto.dryRun === true;
    try {
      return await serializable(this.prisma, async (tx) => {
        if (!await tx.company.findFirst({ where: { id: dto.companyId, active: true } })) throw new ApiError(400, 'INVALID_COMPANY', 'Choose an active company.');
        const [references, existing] = await Promise.all([
          tx.referenceValue.findMany({ where: { kind: { in: ['ALLERGEN', 'DIETARY_TAG'] }, active: true }, select: { id: true, kind: true, name: true } }),
          tx.employee.findMany({ where: { companyId: dto.companyId }, select: { email: true } }),
        ]);
        const table = (kind: string) => new Map(references.filter((entry) => entry.kind === kind).map((entry) => [entry.name.toLowerCase(), entry.id]));
        const plan = planEmployeeImport(dto.csv, { allergens: table('ALLERGEN'), dietaryTags: table('DIETARY_TAG'),
          existingEmails: new Set(existing.map((employee) => employee.email.toLowerCase())) });
        if (dryRun) return importSummary(dto.companyId, true, plan.rows);
        // Set-based inserts keep a 2,000-row file well inside one transaction; ids are assigned here so rows can report them.
        const created = plan.candidates.map((candidate) => ({ ...candidate, id: randomUUID() }));
        await tx.employee.createMany({ data: created.map(({ id, name, email, phone, canChooseAddress, canChangeTime, canChangePackaging }) =>
          ({ id, companyId: dto.companyId, name, email, phone, canChooseAddress, canChangeTime, canChangePackaging })) });
        await tx.employeeAllergen.createMany({ data: created.flatMap((entry) => entry.allergenIds.map((referenceId) => ({ employeeId: entry.id, referenceId }))) });
        await tx.employeeDietaryTag.createMany({ data: created.flatMap((entry) => entry.dietaryTagIds.map((referenceId) => ({ employeeId: entry.id, referenceId }))) });
        for (const entry of created) {
          const row = plan.rows.find((candidate) => candidate.line === entry.line)!;
          row.status = 'CREATED'; row.employeeId = entry.id;
        }
        return importSummary(dto.companyId, false, plan.rows);
      }, { timeout: 30_000 });
    } catch (error) { return translateDatabaseError(error); }
  }

  private async validateReferences(tx: Prisma.TransactionClient, allergens?: string[], tags?: string[]): Promise<void> {
    if (allergens && await tx.referenceValue.count({ where: { id: { in: allergens }, kind: 'ALLERGEN', active: true } }) !== allergens.length) throw new ApiError(400, 'INVALID_ALLERGEN', 'Choose active allergen references.');
    if (tags && await tx.referenceValue.count({ where: { id: { in: tags }, kind: 'DIETARY_TAG', active: true } }) !== tags.length) throw new ApiError(400, 'INVALID_DIETARY_TAG', 'Choose active dietary tags.');
  }
}
