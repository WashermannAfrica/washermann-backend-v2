import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { CompaniesService } from './companies.service';
import { CompanyWalletService } from './company-wallet.service';
import {
  CreateCompanyDto,
  ActivateCompanyDto,
  UpdateCompanyDto,
  UpdateCompanyStatusDto,
  GrantAdminDto,
  AddEmployeeDto,
  ReassignTierDto,
  CreateTierDto,
  UpdateTierDto,
} from './dto';
import { AdminCompanyWalletCreditDto, AdminCompanyWalletDebitDto } from './dto/admin-company-wallet.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Public } from '../../common/decorators/public.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(
    private readonly companiesService: CompaniesService,
    private readonly companyWalletService: CompanyWalletService,
  ) {}

  // ─── Platform-Admin: CRUD Companies ──────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: '[Admin] Create a company and send activation invite',
    description:
      'Creates the company record and sends a one-time 48-hour activation link to the company owner email. ' +
      'The company is PENDING until the owner completes activation.',
  })
  @ApiResponse({ status: 201, description: 'Company created; invite sent' })
  createCompany(@Body() dto: CreateCompanyDto) {
    return this.companiesService.createCompany(dto);
  }

  // ─── Company activation (public — called from invite link) ───────────────────

  @Post('activate')
  @Public()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Activate a company account (company owner, via invite link)',
    description:
      'The company owner clicks the invite link, which carries a one-time token. ' +
      'They fill in company profile details and set a password. ' +
      'The token is consumed immediately — cannot be replayed.',
  })
  @ApiResponse({ status: 200, description: 'Company activated' })
  @ApiResponse({ status: 401, description: 'Invalid or expired token' })
  @ApiResponse({ status: 409, description: 'Company already activated' })
  activateCompany(@Body() dto: ActivateCompanyDto) {
    return this.companiesService.activateCompany(dto);
  }

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] List all companies' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listCompanies(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.companiesService.listCompanies(Number(page), Number(limit));
  }

  @Get(':companyId')
  @Roles(Role.ADMIN, Role.COMPANY_OWNER, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: '[Admin | CompanyOwner | CompanyAdmin] Get company details' })
  async getCompany(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companiesService.getCompany(companyId);
  }

  @Patch(':companyId')
  @Roles(Role.ADMIN, Role.COMPANY_OWNER, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: '[Admin | CompanyOwner | CompanyAdmin] Update company profile' })
  async updateCompany(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: UpdateCompanyDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companiesService.updateCompany(companyId, dto);
  }

  @Patch(':companyId/status')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin only] Update company platform status (active/inactive)' })
  updateCompanyStatus(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: UpdateCompanyStatusDto,
  ) {
    return this.companiesService.updateCompanyStatus(companyId, dto);
  }

  // ─── Tiers ───────────────────────────────────────────────────────────────────

  @Get(':companyId/tiers')
  @Roles(Role.ADMIN, Role.COMPANY_OWNER, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'List benefit tiers for a company' })
  async listTiers(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companiesService.listTiers(companyId);
  }

  @Post(':companyId/tiers')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN, Role.COMPANY_OWNER, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Create a benefit tier for a company' })
  async createTier(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: CreateTierDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companiesService.createTier(companyId, dto);
  }

  @Patch(':companyId/tiers/:tierId')
  @Roles(Role.ADMIN, Role.COMPANY_OWNER, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Update a tier' })
  async updateTier(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('tierId', ParseUUIDPipe) tierId: string,
    @Body() dto: UpdateTierDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companiesService.updateTier(companyId, tierId, dto);
  }

  @Delete(':companyId/tiers/:tierId')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.COMPANY_OWNER, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Delete a tier' })
  async deleteTier(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('tierId', ParseUUIDPipe) tierId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companiesService.deleteTier(companyId, tierId);
  }

  // ─── Employees ───────────────────────────────────────────────────────────────

  @Get(':companyId/employees')
  @Roles(Role.ADMIN, Role.COMPANY_OWNER, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'List employees of a company' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async listEmployees(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companiesService.listEmployees(
      companyId,
      Number(page),
      Number(limit),
    );
  }

  @Post(':companyId/employees')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN, Role.COMPANY_OWNER, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Add an employee to the company (invites if new user)' })
  async addEmployee(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: AddEmployeeDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companiesService.addEmployee(companyId, dto);
  }

  @Delete(':companyId/employees/:employeeId')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.COMPANY_OWNER, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Remove an employee from a company' })
  async removeEmployee(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companiesService.removeEmployee(companyId, employeeId);
  }

  @Patch(':companyId/employees/:employeeId/tier')
  @Roles(Role.ADMIN, Role.COMPANY_OWNER, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: "Reassign an employee's benefit tier" })
  async reassignTier(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Body() dto: ReassignTierDto,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companiesService.reassignTier(companyId, employeeId, dto);
  }

  // ─── Company Admins ───────────────────────────────────────────────────────────

  @Get(':companyId/admins')
  @Roles(Role.ADMIN, Role.COMPANY_OWNER, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'List admins and the owner of a company' })
  async listAdmins(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companiesService.listAdmins(companyId);
  }

  @Post(':companyId/admins/:targetUserId')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN, Role.COMPANY_OWNER)
  @ApiOperation({
    summary: '[Owner | Admin] Grant company admin or owner role to a user',
    description:
      'Granting OWNER role is restricted to the current COMPANY_OWNER (or platform ADMIN). ' +
      'A COMPANY_ADMIN cannot escalate any user to OWNER.',
  })
  async addAdmin(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string,
    @Body() dto: GrantAdminDto,
    @CurrentUser('id') callerId: string,
    @CurrentUser('roles') callerRoles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, callerId, callerRoles);
    return this.companiesService.addAdmin(
      companyId,
      targetUserId,
      dto,
      callerId,
      callerRoles,
    );
  }

  @Delete(':companyId/admins/:targetUserId')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.COMPANY_OWNER, Role.COMPANY_ADMIN)
  @ApiOperation({
    summary: 'Revoke company admin access from a user',
    description:
      'Removing an OWNER requires the caller to also be OWNER (or platform ADMIN). ' +
      'The last OWNER cannot be removed.',
  })
  async removeAdmin(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('targetUserId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser('id') callerId: string,
    @CurrentUser('roles') callerRoles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, callerId, callerRoles);
    return this.companiesService.removeAdmin(
      companyId,
      targetUserId,
      callerId,
      callerRoles,
    );
  }

  // ─── Company Wallet ───────────────────────────────────────────────────────────

  @Get(':companyId/wallet')
  @Roles(Role.ADMIN, Role.COMPANY_OWNER, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: '[Admin | CompanyOwner | CompanyAdmin] Get company wallet balance' })
  async getCompanyWallet(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companyWalletService.getWallet(companyId);
  }

  @Get(':companyId/wallet/ledger')
  @Roles(Role.ADMIN, Role.COMPANY_OWNER, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: '[Admin | CompanyOwner | CompanyAdmin] Get company wallet ledger' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getCompanyLedger(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companyWalletService.getLedger(companyId, Number(page), Number(limit));
  }

  @Post(':companyId/wallet/credit')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin only] Manually credit WashPoints to company wallet' })
  adminCreditCompanyWallet(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: AdminCompanyWalletCreditDto,
  ) {
    return this.companyWalletService.adminCredit(companyId, dto);
  }

  @Post(':companyId/wallet/debit')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin only] Manually debit WashPoints from company wallet' })
  adminDebitCompanyWallet(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: AdminCompanyWalletDebitDto,
  ) {
    return this.companyWalletService.adminDebit(companyId, dto);
  }

  // ─── Employee Transactions ────────────────────────────────────────────────────

  @Get(':companyId/employees/:employeeId/transactions')
  @Roles(Role.ADMIN, Role.COMPANY_OWNER, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: '[Admin | CompanyOwner | CompanyAdmin] Get employee benefit transactions' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  async getEmployeeTransactions(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('employeeId', ParseUUIDPipe) employeeId: string,
    @Query('page') page = 1,
    @Query('limit') limit = 20,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companiesService.getEmployeeTransactions(
      companyId,
      employeeId,
      Number(page),
      Number(limit),
    );
  }
}
