import { Controller, Get } from '@nestjs/common';
import { Public } from '../../common/access.decorator';

@Controller()
export class RootController {
  @Public()
  @Get()
  root(): { service: string; health: string } {
    return { service: 'fernleaf-api', health: '/api/v1/health' };
  }
}
