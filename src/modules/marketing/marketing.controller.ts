import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  ParseIntPipe,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { MarketingService } from './marketing.service';
import { CreateWaitlistDto } from './dto/create-waitlist.dto';
import { CreateWashRepApplicationDto } from './dto/create-wash-rep-application.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Marketing')
@Controller('marketing')
export class MarketingController {
  constructor(private readonly marketingService: MarketingService) {}

  // ─── Waitlist ────────────────────────────────────────────────────────────────

  @Post('waitlist')
  @Public()
  @ApiOperation({ summary: 'Join the launch waitlist (public)' })
  joinWaitlist(@Body() dto: CreateWaitlistDto) {
    return this.marketingService.joinWaitlist(dto);
  }

  @Get('waitlist')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List waitlist signups (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listWaitlist(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.marketingService.listWaitlist({ page, limit });
  }

  // ─── Wash Rep applications ─────────────────────────────────────────────────────

  @Post('wash-rep-applications')
  @Public()
  @ApiOperation({ summary: 'Submit a Wash Rep application (public)' })
  applyWashRep(@Body() dto: CreateWashRepApplicationDto) {
    return this.marketingService.applyWashRep(dto);
  }

  @Get('wash-rep-applications')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List Wash Rep applications (admin)' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listWashRepApplications(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.marketingService.listWashRepApplications({ page, limit });
  }
}
