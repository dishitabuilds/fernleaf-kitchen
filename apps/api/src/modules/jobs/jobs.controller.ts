import { Controller, Headers, HttpCode, Inject, Post } from '@nestjs/common';
import { createHash, timingSafeEqual } from 'node:crypto';
import { Public } from '../../common/access.decorator';
import { ApiError } from '../../common/api-error';
import { API_CONFIG, type ApiConfig } from '../../config';
import { JobsService } from './jobs.service';

@Controller('jobs')
export class JobsController {
  constructor(@Inject(API_CONFIG) private readonly config: ApiConfig, private readonly jobs: JobsService) {}

  // Public skips browser session/CSRF only. AccessGuard still enforces the exact
  // WEB_ORIGIN on this POST; an external scheduler must supply that Origin.
  @Post('maintain') @HttpCode(200) @Public()
  maintain(@Headers('authorization') authorization?: string) {
    if (!this.config.maintenanceToken) throw new ApiError(404, 'JOB_DISABLED', 'External maintenance is disabled.');
    const supplied = /^Bearer ([^\s]+)$/i.exec(authorization ?? '')?.[1];
    const hash = (value: string) => createHash('sha256').update(value).digest();
    if (!supplied || !timingSafeEqual(hash(supplied), hash(this.config.maintenanceToken))) {
      throw new ApiError(401, 'JOB_UNAUTHORIZED', 'A valid maintenance credential is required.');
    }
    return this.jobs.maintain();
  }
}
