import { Controller, Get, Param, Post, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ItemPricingService } from './item-pricing.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Pricing')
@ApiBearerAuth()
@Controller('pricing/items')
export class ItemPricingController {
  constructor(private readonly service: ItemPricingService) {}

  @Post('recompute')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: recompute all item prices now (P70 + charges) and append audit rows' })
  recompute(@CurrentUser('id') adminId: string) {
    return this.service.recomputeAll(adminId);
  }

  @Get(':id/breakdown')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: preview an item price breakdown (base P70 + each charge), without saving' })
  breakdown(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.breakdown(id);
  }
}
