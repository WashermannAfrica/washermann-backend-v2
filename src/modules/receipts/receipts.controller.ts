import { Controller, Get, Param, ParseUUIDPipe, Post, Request } from '@nestjs/common';
import { ApiOperation, ApiParam, ApiTags } from '@nestjs/swagger';
import { ReceiptsService } from './receipts.service';
import { ReceiptParty } from '../../database/entities/order-receipt.entity';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';

type Req = { user: { sub: string; roles?: string[] } };

@ApiTags('Order receipts')
@Controller('orders/:id/receipts')
export class ReceiptsController {
  constructor(private readonly receiptsService: ReceiptsService) {}

  @Get()
  @ApiOperation({ summary: 'List the receipts the caller may view for this order' })
  list(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.receiptsService.listForRequester(id, req.user.sub, req.user.roles ?? []);
  }

  @Get(':party')
  @ApiOperation({ summary: "Get one receipt's image URL (customer | vendor | rep | platform)" })
  @ApiParam({ name: 'party', enum: ['customer', 'vendor', 'rep', 'platform'] })
  getOne(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('party') party: ReceiptParty,
    @Request() req: Req,
  ) {
    return this.receiptsService.getOne(id, party, req.user.sub, req.user.roles ?? []);
  }

  @Post('generate')
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Regenerate all four receipt images for this order (admin)' })
  generate(@Param('id', ParseUUIDPipe) id: string) {
    return this.receiptsService.generateForOrder(id);
  }
}
