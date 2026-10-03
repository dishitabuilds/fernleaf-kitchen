import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { API_CONFIG, type ApiConfig } from './config';
import { AccessGuard } from './common/access.guard';
import { PrismaService } from './database/prisma.service';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { HealthController } from './modules/health/health.controller';
import { SettingsController } from './modules/settings/settings.controller';

@Module({})
export class AppModule {
  static register(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [AuthController, HealthController, SettingsController],
      providers: [
        { provide: API_CONFIG, useValue: config },
        PrismaService, AuthService,
        { provide: APP_GUARD, useClass: AccessGuard },
      ],
    };
  }
}
