import { Inject, Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { API_CONFIG, type ApiConfig } from '../config';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(@Inject(API_CONFIG) config: ApiConfig) {
    super({ adapter: new PrismaPg({ connectionString: config.databaseUrl, connectionTimeoutMillis: 5_000 }) });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
