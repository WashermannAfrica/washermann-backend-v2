import { Body, Controller, Get, Param, Post, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderQuoteService } from './order-quote.service';

class ItemSelectionDto {
  @ApiProperty({
    description: 'Catalogue item UUID (from GET /catalogue). Item must be active, available, and priced.',
    example: '77fbd250-f64c-4be2-b5f9-bed819d1f206',
    format: 'uuid',
  })
  @IsUUID()
  itemId: string;

  @ApiProperty({ description: 'How many of this item', example: 3, minimum: 1 })
  @IsInt()
  @Min(1)
  qty: number;
}

class WashIronQuoteDto {
  @ApiProperty({
    description: 'The customer\'s basket — one entry per selected catalogue item',
    type: [ItemSelectionDto],
    example: [
      { itemId: '77fbd250-f64c-4be2-b5f9-bed819d1f206', qty: 3 },
      { itemId: 'a1b2c3d4-0000-4000-8000-000000000000', qty: 1 },
    ],
  })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => ItemSelectionDto)
  selections: ItemSelectionDto[];
}

@ApiTags('Pricing')
@ApiBearerAuth()
@Controller('quote')
export class OrderQuoteController {
  constructor(private readonly service: OrderQuoteService) {}

  @Post('wash-iron')
  @ApiOperation({
    summary: 'Quote a Wash & Iron selection (server-authoritative)',
    description:
      'Prices a basket of catalogue items for the Wash & Iron flow. Each unit price is the item\'s ' +
      'platform price (P70 engine) uplifted by the configured ironing percent; totals are returned in ' +
      '₦ and WP with the conversion-rate snapshot used. The order placement endpoint re-runs this same ' +
      'calculation internally — client-side totals are never trusted, so what this returns is exactly ' +
      'what POST /orders will charge.\n\n' +
      'Response: `{ flow: "wash_iron", lines: [{ itemId, name, qty, unitNgn, subtotalNgn }], totalNgn, ' +
      'totalWp, conversionRateId, conversionRateSnapshot, calculatedAt }` — `unitNgn` already includes ' +
      'the ironing uplift.\n\n' +
      'Errors: 404 unknown item; 400 item inactive/unpriced ("Item not available for ordering"); 400 empty selection.',
  })
  washIron(@Body() dto: WashIronQuoteDto) {
    return this.service.quoteWashIron(dto.selections);
  }

  @Get('bag/:bagId')
  @ApiOperation({
    summary: 'Quote a Wash & Fold bag price (server-authoritative)',
    description:
      'Returns the bag\'s cached derived price (P70 of everyday-item prices × allowedItemCount) as a ' +
      'single-line quote in ₦ and WP, in the same Quote shape as POST /quote/wash-iron. ' +
      'Errors: 404 unknown bag; 400 bag inactive/unpriced.',
  })
  @ApiParam({ name: 'bagId', description: 'Bag UUID (from GET /bags)', format: 'uuid' })
  bag(@Param('bagId', ParseUUIDPipe) bagId: string) {
    return this.service.quoteBag(bagId);
  }
}
