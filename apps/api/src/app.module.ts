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
import { CutoffsController } from './modules/cutoffs/cutoffs.controller';
import { CutoffsService } from './modules/cutoffs/cutoffs.service';
import { CutoffsScheduler } from './modules/cutoffs/cutoffs.scheduler';
import { OrdersController } from './modules/orders/orders.controller';
import { ORDER_QUOTE_POLICY, OrdersService } from './modules/orders/orders.service';
import type { QuotePolicy } from './modules/orders/order.quote';
import { KitchenController, PrepUnitsController } from './modules/kitchen/kitchen.controller';
import { KitchenService } from './modules/kitchen/kitchen.service';
import { DropsController } from './modules/drops/drops.controller';
import { DropsService } from './modules/drops/drops.service';
import { DriverController } from './modules/driver/driver.controller';
import { OperationsAction } from './modules/operations/operations.action';
import { BillingController } from './modules/billing/billing.controller';
import { BillingService } from './modules/billing/billing.service';
import { StaffController } from './modules/staff/staff.controller';
import { StaffService } from './modules/staff/staff.service';
import { DashboardController } from './modules/dashboard/dashboard.controller';
import { DashboardService } from './modules/dashboard/dashboard.service';
import { DemoScheduler } from './modules/demo/demo.scheduler';
import { JobsController } from './modules/jobs/jobs.controller';
import { JobsService } from './modules/jobs/jobs.service';

@Module({})
export class AppModule {
  static register(config: ApiConfig): DynamicModule {
    return {
      module: AppModule,
      controllers: [AuthController, HealthController, SettingsController, ReferenceDataController, CompaniesController, EmployeesController, CatalogueController, PricingController, MenuController, CutoffsController, OrdersController, KitchenController, PrepUnitsController, DropsController, DriverController, BillingController, StaffController, DashboardController, JobsController],
      providers: [
        { provide: API_CONFIG, useValue: config },
        { provide: ORDER_QUOTE_POLICY, useValue: {
          maximumSelectionsPerGroup: 1, ordinaryCustomAddresses: false, rejectDuplicateDishLines: true,
        } satisfies QuotePolicy },
        PrismaService, AuthService, Clock, SettingsService, ReferenceDataService, CompaniesService, EmployeesService, CatalogueService, PricingService, MenuService, CutoffsService, CutoffsScheduler, OrdersService, OperationsAction, KitchenService, DropsService, BillingService, StaffService, DashboardService, DemoScheduler, JobsService,
        { provide: APP_GUARD, useClass: AccessGuard },
      ],
    };
  }
}
