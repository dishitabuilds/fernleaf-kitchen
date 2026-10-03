import { Body, Controller, HttpCode, Post, Req } from '@nestjs/common';
import { RequirePermissions } from '../../common/access.decorator';
import type { ApiRequest } from '../../common/request';
import { ProcessCutoffDto } from './cutoffs.dto';
import { CutoffsService } from './cutoffs.service';

@Controller('cutoffs')
export class CutoffsController {
  constructor(private readonly cutoffs: CutoffsService) {}

  @RequirePermissions('orders.manage')
  @Post('process')
  @HttpCode(200)
  process(@Body() dto: ProcessCutoffDto, @Req() request: ApiRequest) {
    return this.cutoffs.processDate(dto.deliveryDate, request.auth!.response.user);
  }
}
