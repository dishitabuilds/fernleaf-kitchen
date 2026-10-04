import { Injectable, Logger } from '@nestjs/common';
import { ApiError } from '../../common/api-error';
import { Clock } from '../../common/clock';
import { PrismaService } from '../../database/prisma.service';
import { CutoffsService } from '../cutoffs/cutoffs.service';
import { seedDemoFixtures } from '../demo/demo-fixtures';

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);
  constructor(private readonly cutoffs: CutoffsService, private readonly prisma: PrismaService, private readonly clock: Clock) {}

  async maintain() {
    try {
      const results = await this.cutoffs.scanDue();
      const cutoffs = results.reduce((total, result) => ({ dates: total.dates + 1, confirmed: total.confirmed + result.confirmed,
        cancelled: total.cancelled + result.cancelled, skipped: total.skipped + result.skipped, failed: total.failed + result.failed }),
      { dates: 0, confirmed: 0, cancelled: 0, skipped: 0, failed: 0 });
      if (cutoffs.failed) throw new Error('Shared cutoff processor reported a failed transition.');
      const fixtures = process.env.DEMO_FIXTURES_ENABLED === 'true' ? await seedDemoFixtures(this.prisma, this.clock.now()) : null;
      const result = { cutoffs, fixtures };
      this.logger.log(JSON.stringify({ event: 'external_maintenance_completed', ...result }));
      return result;
    } catch {
      // Never echo the bearer token, database exceptions or purchase snapshots.
      this.logger.error('External maintenance failed; retry and inspect database health and cutoff job logs.');
      throw new ApiError(503, 'MAINTENANCE_FAILED', 'Maintenance failed. Retry and inspect the server job logs.');
    }
  }
}
