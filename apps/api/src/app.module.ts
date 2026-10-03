import { DynamicModule, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { API_CONFIG, type ApiConfig } from './config';
import { AccessGuard } from './common/access.guard';
import { PrismaService } from './database/prisma.service';
import { AuthController } from './modules/auth/auth.controller';
import { AuthService } from './modules/auth/auth.service';
import { HealthController } from './modules/health/health.controller';
import { SettingsController } from './modules/settings/settings.controller';
import { SettingsService } from './modules/settings/settings.service';
import { ReferenceDataController } from './modules/settings/reference-data.controller';
import { ReferenceDataService } from './modules/settings/reference-data.service';
import { CompaniesController } from './modules/companies/companies.controller';
import { CompaniesService } from './modules/companies/companies.service';
import { EmployeesController } from './modules/employees/employees.controller';
import { EmployeesService } from './modules/employees/employees.service';
import { CatalogueController } from './modules/catalogue/catalogue.controller';
import { CatalogueService } from './modules/catalogue/catalogue.service';
import { PricingController } from './modules/pricing/pricing.controller';
import { PricingService } from './modules/pricing/pricing.service';
import { MenuController } from './modules/menu/menu.controller';
import { MenuService } from './modules/menu/menu.service';
import { Clock } from './common/clock';

@Module({})
export class AppModule {
  static register(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [AuthController, HealthController, SettingsController, ReferenceDataController, CompaniesController, EmployeesController, CatalogueController, PricingController, MenuController],
      providers: [
        { provide: API_CONFIG, useValue: config },
        PrismaService, AuthService, Clock, SettingsService, ReferenceDataService, CompaniesService, EmployeesService, CatalogueService, PricingService, MenuService,
        { provide: APP_GUARD, useClass: AccessGuard },
      ],
    };
  }
}
