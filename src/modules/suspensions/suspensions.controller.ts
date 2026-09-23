import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query, Request } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SuspensionsService } from './suspensions.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';
import { IssueSuspensionDto, RespondSuspensionDto, RequestReviewDto, ReviewDecisionDto } from './dto/suspension.dto';

/** Suspension due-process for vendors & reps (WS4 1.14). */
@ApiTags('Suspensions')
@ApiBearerAuth()
@Controller('suspensions')
export class SuspensionsController {
  constructor(private readonly service: SuspensionsService) {}

  // ─── Admin ──────────────────────────────────────────────────────────────────
  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Issue a suspension notice (response window before enforcement)' })
  issue(@Body() dto: IssueSuspensionDto, @Request() req: { user: { sub: string } }) {
    return this.service.issueNotice(dto, req.user.sub);
  }

  @Post('immediate')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Immediately suspend for fraud/safety (no response window)' })
  immediate(@Body() dto: IssueSuspensionDto, @Request() req: { user: { sub: string } }) {
    return this.service.immediateSuspend(dto, req.user.sub);
  }

  @Post(':id/withdraw')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Withdraw an open notice (no suspension)' })
  withdraw(@Param('id', ParseUUIDPipe) id: string, @Request() req: { user: { sub: string } }) {
    return this.service.withdraw(id, req.user.sub);
  }

  @Post(':id/enforce')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Enforce a notice — suspends the vendor/rep' })
  enforce(@Param('id', ParseUUIDPipe) id: string, @Request() req: { user: { sub: string } }) {
    return this.service.enforce(id, req.user.sub);
  }

  @Post(':id/review-decision')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Decide an internal review — uphold or overturn (reinstate)' })
  decide(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewDecisionDto, @Request() req: { user: { sub: string } }) {
    return this.service.decideReview(id, req.user.sub, dto.decision, dto.note);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List suspension notices (admin)' })
  @ApiQuery({ name: 'subjectType', required: false })
  @ApiQuery({ name: 'subjectId', required: false })
  @ApiQuery({ name: 'status', required: false })
  list(@Query('subjectType') subjectType?: string, @Query('subjectId') subjectId?: string, @Query('status') status?: string) {
    return this.service.list({ subjectType, subjectId, status });
  }

  // ─── Subject (vendor / rep) ─────────────────────────────────────────────────
  @Get('mine')
  @Roles(Role.VENDOR, Role.REP)
  @ApiOperation({ summary: 'The signed-in vendor/rep’s suspension notices' })
  mine(@Request() req: { user: { sub: string } }) {
    return this.service.listMine(req.user.sub);
  }

  @Post(':id/respond')
  @Roles(Role.VENDOR, Role.REP)
  @ApiOperation({ summary: 'Respond/remedy during the notice window' })
  respond(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RespondSuspensionDto, @Request() req: { user: { sub: string } }) {
    return this.service.respond(id, req.user.sub, dto.response);
  }

  @Post(':id/request-review')
  @Roles(Role.VENDOR, Role.REP)
  @ApiOperation({ summary: 'Request an internal review of a suspension' })
  requestReview(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RequestReviewDto, @Request() req: { user: { sub: string } }) {
    return this.service.requestReview(id, req.user.sub, dto.note);
  }
}
