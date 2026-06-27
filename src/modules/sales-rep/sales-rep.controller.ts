import {
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SalesRepService } from './sales-rep.service';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';
import { CreateSalesRepApplicationDto } from './dto/create-sales-rep-application.dto';
import { RejectApplicationDto } from './dto/review-application.dto';
import { SubmitAssessmentDto } from './dto/submit-assessment.dto';
import { RequestSalesRepPayoutDto } from './dto/request-payout.dto';
import { CreateTutorialStepDto, UpdateTutorialStepDto } from './dto/tutorial-step.dto';
import { CreateAssessmentQuestionDto, UpdateAssessmentQuestionDto } from './dto/assessment-question.dto';

@ApiTags('Sales Rep')
@Controller('sales-rep')
export class SalesRepController {
  constructor(private readonly service: SalesRepService) {}

  // ─── Public application ───────────────────────────────────────────────────────
  @Post('applications')
  @Public()
  @ApiOperation({ summary: 'Apply to become a sales rep (public)' })
  apply(@Body() dto: CreateSalesRepApplicationDto) {
    return this.service.apply(dto);
  }

  @Get('applications')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: list sales-rep applications' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listApplications(
    @Query('status') status: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.service.listApplications({ status, page, limit });
  }

  @Post('applications/:id/accept')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: accept an application (creates account + invite)' })
  accept(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') adminId: string) {
    return this.service.acceptApplication(id, adminId);
  }

  @Post('applications/:id/reject')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: reject an application' })
  reject(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RejectApplicationDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.service.rejectApplication(id, adminId, dto.reason);
  }

  // ─── Onboarding (sales rep) ───────────────────────────────────────────────────
  @Get('tutorial')
  @ApiBearerAuth()
  @Roles(Role.SALES_REP)
  @ApiOperation({ summary: 'Sales rep: onboarding tutorial steps' })
  tutorial() {
    return this.service.getTutorial();
  }

  @Get('assessment')
  @ApiBearerAuth()
  @Roles(Role.SALES_REP)
  @ApiOperation({ summary: 'Sales rep: assessment questions (no answers)' })
  assessment() {
    return this.service.getAssessment();
  }

  @Post('assessment/submit')
  @ApiBearerAuth()
  @Roles(Role.SALES_REP)
  @ApiOperation({ summary: 'Sales rep: submit assessment (hard gate; issues code on pass)' })
  submit(@Body() dto: SubmitAssessmentDto, @CurrentUser('id') userId: string) {
    return this.service.submitAssessment(userId, dto);
  }

  @Get('dashboard')
  @ApiBearerAuth()
  @Roles(Role.SALES_REP)
  @ApiOperation({ summary: 'Sales rep: dashboard (code, referrals, payouts)' })
  dashboard(@CurrentUser('id') userId: string) {
    return this.service.getDashboard(userId);
  }

  // ─── Payouts ──────────────────────────────────────────────────────────────────
  @Get('payouts')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: list sales-rep payouts' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listPayouts(
    @Query('status') status: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.service.listPayouts({ status, page, limit });
  }

  @Post('payouts/request')
  @ApiBearerAuth()
  @Roles(Role.SALES_REP)
  @ApiOperation({ summary: 'Sales rep: request a cash payout of available balance' })
  requestPayout(@Body() dto: RequestSalesRepPayoutDto, @CurrentUser('id') userId: string) {
    return this.service.requestPayout(userId, dto);
  }

  @Post('payouts/:id/approve')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: approve/complete a payout (marks referrals paid)' })
  approvePayout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reference?: string },
    @CurrentUser('id') adminId: string,
  ) {
    return this.service.approvePayout(id, adminId, body?.reference);
  }

  @Post('payouts/:id/fail')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: mark a payout failed (referrals stay available)' })
  failPayout(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() body: { reason?: string },
    @CurrentUser('id') adminId: string,
  ) {
    return this.service.failPayout(id, adminId, body?.reason);
  }

  // ─── Admin: consolidated overview ─────────────────────────────────────────────
  @Get('admin/summary')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: sales-rep program overview (applications, reps, payouts)' })
  adminSummary() {
    return this.service.adminSummary();
  }

  // ─── Admin: content management — tutorial steps ───────────────────────────────
  @Get('admin/tutorial-steps')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: list all tutorial steps (incl. inactive)' })
  listSteps() {
    return this.service.adminListSteps();
  }

  @Post('admin/tutorial-steps')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: create a tutorial step' })
  createStep(@Body() dto: CreateTutorialStepDto) {
    return this.service.createStep(dto);
  }

  @Patch('admin/tutorial-steps/:id')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: update a tutorial step' })
  updateStep(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateTutorialStepDto) {
    return this.service.updateStep(id, dto);
  }

  @Delete('admin/tutorial-steps/:id')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: delete a tutorial step' })
  deleteStep(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteStep(id);
  }

  // ─── Admin: content management — assessment questions ─────────────────────────
  @Get('admin/questions')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: list all assessment questions (incl. correct answers)' })
  listQuestions() {
    return this.service.adminListQuestions();
  }

  @Post('admin/questions')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: create an assessment question' })
  createQuestion(@Body() dto: CreateAssessmentQuestionDto) {
    return this.service.createQuestion(dto);
  }

  @Patch('admin/questions/:id')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: update an assessment question' })
  updateQuestion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAssessmentQuestionDto) {
    return this.service.updateQuestion(id, dto);
  }

  @Delete('admin/questions/:id')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: delete an assessment question' })
  deleteQuestion(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.deleteQuestion(id);
  }

  // ─── Admin: sales reps ────────────────────────────────────────────────────────
  @Get()
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: list sales reps' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listSalesReps(
    @Query('status') status: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.service.listSalesReps({ status, page, limit });
  }

  @Get(':userId')
  @ApiBearerAuth()
  @Roles(Role.ADMIN, Role.FINANCE)
  @ApiOperation({ summary: 'Admin: one sales rep — profile, earnings, referrals, payouts' })
  salesRepDetail(@Param('userId', ParseUUIDPipe) userId: string) {
    return this.service.salesRepDetail(userId);
  }

  @Post(':userId/upgrade-to-wash-rep')
  @ApiBearerAuth()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin: upgrade a sales rep to a wash rep (grants REP role)' })
  upgrade(@Param('userId', ParseUUIDPipe) userId: string, @CurrentUser('id') adminId: string) {
    return this.service.upgradeToWashRep(userId, adminId);
  }
}
