import { Body, Controller, Get, Param, Post, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ArrayNotEmpty, IsArray, IsInt, IsUUID, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { OrderQuoteService } from './order-quote.service';

class ItemSelectionDto {
  @IsUUID()
  itemId: string;

  @IsInt()
  @Min(1)
  qty: number;
}

class WashIronQuoteDto {
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
  @ApiOperation({ summary: 'Quote a Wash & Iron selection (live total: Σ item price + ironing × qty)' })
  washIron(@Body() dto: WashIronQuoteDto) {
    return this.service.quoteWashIron(dto.selections);
  }

  @Get('bag/:bagId')
  @ApiOperation({ summary: 'Quote a Wash & Fold bag price' })
  bag(@Param('bagId', ParseUUIDPipe) bagId: string) {
    return this.service.quoteBag(bagId);
  }
}
