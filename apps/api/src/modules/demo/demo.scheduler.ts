import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Clock } from '../../common/clock';
import { PrismaService } from '../../database/prisma.service';
import { kitchenDate } from '../../domain/calendar';
import { seedDemoFixtures } from './demo-fixtures';

@Injectable()
export class DemoScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(DemoScheduler.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;
  private completedDate?: string;
  constructor(private readonly prisma: PrismaService, private readonly clock: Clock) {}

  async onApplicationBootstrap(): Promise<void> {
    if (process.env.DEMO_FIXTURES_ENABLED !== 'true' || process.env.NODE_ENV === 'test') return;
    await this.catchUp();
    // The timezone-aware date check appends at the first minute after IST
    // midnight. Startup catch-up covers restarts and sleeping hosts.
    this.timer = setInterval(() => { void this.catchUp(); }, 60_000);
    this.timer.unref();
  }
  async catchUp(): Promise<void> {
    const now = this.clock.now(), date = kitchenDate(now);
    if (this.running || this.completedDate === date) return;
    this.running = true;
    try {
      const result = await seedDemoFixtures(this.prisma, now);
      this.completedDate = date;
      this.logger.log(JSON.stringify({ event: 'demo_fixtures_appended', ...result }));
      if (result.unavailableScenarios) this.logger.warn('Some demo scenarios were skipped to preserve inactive/edited configuration or existing stops.');
    } catch {
      this.logger.error('Demo fixture catch-up failed; the next minute will retry. Run migrations and initial seed, then inspect database health.');
    } finally { this.running = false; }
  }
  onModuleDestroy(): void { if (this.timer) clearInterval(this.timer); }
}
