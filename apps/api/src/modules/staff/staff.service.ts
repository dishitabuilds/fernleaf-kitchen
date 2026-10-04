import { Injectable } from '@nestjs/common';
import type { StaffPage, StaffUserResponse } from '@fernleaf/contracts';
import { ApiError } from '../../common/api-error';
import { PrismaService } from '../../database/prisma.service';
import { hashPassword } from '../auth/password';
import { translateDatabaseError } from '../../common/transaction';
import type { CreateStaffDto, StaffQueryDto, UpdateStaffDto } from './staff.dto';
import type { StaffRole } from '../../generated/prisma/client';

@Injectable()
export class StaffService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: StaffQueryDto): Promise<StaffPage> {
    const [items, total] = await Promise.all([
      this.prisma.staffUser.findMany({
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }],
        skip: (query.page - 1) * query.pageSize, take: query.pageSize,
        select: { id: true, email: true, displayName: true, role: true, active: true, createdAt: true },
      }),
      this.prisma.staffUser.count(),
    ]);
    return {
      items: items.map((u) => this.toResponse(u)),
      total, page: query.page, pageSize: query.pageSize,
    };
  }

  async read(id: string): Promise<StaffUserResponse> {
    const user = await this.prisma.staffUser.findUnique({
      where: { id },
      select: { id: true, email: true, displayName: true, role: true, active: true, createdAt: true },
    });
    if (!user) throw new ApiError(404, 'NOT_FOUND', 'Staff member not found.');
    return this.toResponse(user);
  }

  async create(dto: CreateStaffDto): Promise<StaffUserResponse> {
    const passwordHash = await hashPassword(dto.password);
    try {
      const user = await this.prisma.staffUser.create({
        data: {
          email: dto.email,
          displayName: dto.displayName,
          passwordHash,
          role: dto.role as StaffRole,
        },
        select: { id: true, email: true, displayName: true, role: true, active: true, createdAt: true },
      });
      return this.toResponse(user);
    } catch (error) {
      translateDatabaseError(error);
    }
  }

  async update(id: string, dto: UpdateStaffDto): Promise<StaffUserResponse> {
    const existing = await this.prisma.staffUser.findUnique({ where: { id }, select: { id: true } });
    if (!existing) throw new ApiError(404, 'NOT_FOUND', 'Staff member not found.');
    const data: Record<string, unknown> = {};
    if (dto.displayName !== undefined) data.displayName = dto.displayName;
    if (dto.role !== undefined) data.role = dto.role;
    if (dto.active !== undefined) data.active = dto.active;
    if (dto.password) data.passwordHash = await hashPassword(dto.password);
    // If deactivating, also expire all sessions
    if (dto.active === false) {
      await this.prisma.session.deleteMany({ where: { userId: id } });
    }
    try {
      const user = await this.prisma.staffUser.update({
        where: { id }, data,
        select: { id: true, email: true, displayName: true, role: true, active: true, createdAt: true },
      });
      return this.toResponse(user);
    } catch (error) {
      translateDatabaseError(error);
    }
  }

  private toResponse(u: { id: string; email: string; displayName: string; role: string; active: boolean; createdAt: Date }): StaffUserResponse {
    return { id: u.id, email: u.email, displayName: u.displayName, role: u.role, active: u.active, createdAt: u.createdAt.toISOString() };
  }
}
