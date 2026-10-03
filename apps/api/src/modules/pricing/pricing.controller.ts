import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { RequirePermissions } from '../../common/access.decorator';
import { CatalogueQuery } from '../catalogue/catalogue.dto';
import { MatrixInput, MatrixQuery, TierInput } from './pricing.dto';
import { PricingService } from './pricing.service';

@Controller('price-tiers')
@RequirePermissions('catalogue.manage')
export class PricingController {
  constructor(private readonly pricing: PricingService) {}
  @Get() list(@Query() query: CatalogueQuery) { return this.pricing.list(query); }
  @Post() create(@Body() input: TierInput) { return this.pricing.save(undefined, input); }
  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string) { return this.pricing.tier(id); }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() input: TierInput) { return this.pricing.save(id, input); }
  @Get(':id/matrix') matrix(@Param('id', ParseUUIDPipe) id: string, @Query() query: MatrixQuery) { return this.pricing.matrix(id, query); }
  @Patch(':id/matrix') patchMatrix(@Param('id', ParseUUIDPipe) id: string, @Body() input: MatrixInput) { return this.pricing.saveMatrix(id, input); }
}
