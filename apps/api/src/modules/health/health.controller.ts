import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthResponse } from '@fernleaf/contracts';
import { Public } from '../../common/access.decorator';
import { PrismaService } from '../../database/prisma.service';

@Controller('health')
export class HealthController {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  @Public()
  @Get()
  async health(): Promise<HealthResponse> {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', database: 'connected', service: 'fernleaf-api' };
  }
}
