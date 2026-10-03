import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { CutoffsService } from './cutoffs.service';

@Injectable()
export class CutoffsScheduler implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(CutoffsScheduler.name);
  private timer?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(private readonly cutoffs: CutoffsService) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.catchUp();
    if (process.env.NODE_ENV !== 'test') {
      this.timer = setInterval(() => { void this.catchUp(); }, 60_000);
      this.timer.unref();
    }
  }

  async catchUp(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const results = await this.cutoffs.scanDue();
      for (const result of results) {
        this.logger.log(JSON.stringify({ event: 'cutoff_processed', ...result }));
      }
    } catch {
      // Never log database URLs, query values, personal snapshots or raw errors.
      this.logger.error('Cutoff catch-up failed; the next minute will retry.');
    } finally { this.running = false; }
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }
}
