import { Injectable } from '@nestjs/common';
import type { ReferenceValueResponse } from '@fernleaf/contracts';
import { ApiError } from '../../common/api-error';
import { serializable, translateDatabaseError } from '../../common/transaction';
import { PrismaService } from '../../database/prisma.service';
import { ReferenceCreateDto, ReferenceListDto, ReferencePatchDto } from '../companies/configuration.dto';
import { normalizeCompanyDomain, rejectUnexpectedNulls, requiredString } from '../companies/configuration.validation';

@Injectable()
export class ReferenceDataService {
  constructor(private readonly prisma: PrismaService) {}
  async list(query: ReferenceListDto): Promise<ReferenceValueResponse[]> {
    return this.prisma.referenceValue.findMany({ where: query.kind ? { kind: query.kind } : {}, orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] });
  }
  async create(dto: ReferenceCreateDto): Promise<ReferenceValueResponse> {
    rejectUnexpectedNulls(dto);
    const name = dto.kind === 'PUBLIC_EMAIL_DOMAIN' ? normalizeCompanyDomain(requiredString(dto.name, 'name')) : requiredString(dto.name, 'name');
    try {
      return await serializable(this.prisma, async (tx) => {
        if (await tx.referenceValue.findFirst({ where: { kind: dto.kind, name: { equals: name, mode: 'insensitive' } } })) throw new ApiError(409, 'DUPLICATE_REFERENCE', 'A reference with this name already exists.');
        if (dto.kind === 'PUBLIC_EMAIL_DOMAIN' && dto.active !== false && await tx.companyDomain.count({ where: { domain: name } })) throw new ApiError(409, 'COMPANY_DOMAIN_IN_USE', 'A company already uses this domain. Resolve its domains before restricting it.');
        return tx.referenceValue.create({ data: { ...dto, name } });
      });
    } catch (error) { return translateDatabaseError(error); }
  }
  async update(id: string, dto: ReferencePatchDto): Promise<ReferenceValueResponse> {
    rejectUnexpectedNulls(dto);
    try {
      return await serializable(this.prisma, async (tx) => {
        const reference = await tx.referenceValue.findUnique({ where: { id } });
        if (!reference) throw new ApiError(404, 'REFERENCE_NOT_FOUND', 'This reference does not exist.');
        const name = dto.name === undefined ? reference.name : reference.kind === 'PUBLIC_EMAIL_DOMAIN' ? normalizeCompanyDomain(dto.name) : dto.name;
        if (await tx.referenceValue.findFirst({ where: { id: { not: id }, kind: reference.kind, name: { equals: name, mode: 'insensitive' } } })) throw new ApiError(409, 'DUPLICATE_REFERENCE', 'A reference with this name already exists.');
        if (reference.kind === 'PUBLIC_EMAIL_DOMAIN' && (dto.active ?? reference.active) && await tx.companyDomain.count({ where: { domain: name } })) throw new ApiError(409, 'COMPANY_DOMAIN_IN_USE', 'A company already uses this domain. Resolve its domains before restricting it.');
        if (dto.active === false) {
          const activeUsage = reference.kind === 'PACKAGING_TYPE' ? await tx.company.count({ where: { active: true, packagingId: id } })
            : reference.kind === 'KITCHEN_STATION' ? await tx.dish.count({ where: { active: true, stationId: id } }) : 0;
          if (activeUsage) throw new ApiError(409, 'REFERENCE_IN_USE', 'Change active records using this reference before retiring it.');
        }
        return tx.referenceValue.update({ where: { id }, data: { ...dto, name } });
      });
    } catch (error) { return translateDatabaseError(error); }
  }
}
