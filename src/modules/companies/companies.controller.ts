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
import {
  CreateCompanyDto,
  UpdateCompanyDto,
  UpdateCompanyStatusDto,
  AddEmployeeDto,
  ReassignTierDto,
  CreateTierDto,
  UpdateTierDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('companies')
export class CompaniesController {
  constructor(private readonly companiesService: CompaniesService) {}

  // ─── Platform-Admin: CRUD Companies ──────────────────────────────────────────

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Create a company' })
  @ApiResponse({ status: 201, description: 'Company created' })
  createCompany(@Body() dto: CreateCompanyDto) {
    return this.companiesService.createCompany(dto);
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
  @Roles(Role.ADMIN, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: '[Admin | CompanyAdmin] Get company details' })
  async getCompany(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companiesService.getCompany(companyId);
  }

  @Patch(':companyId')
  @Roles(Role.ADMIN, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: '[Admin | CompanyAdmin] Update company details' })
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
  @ApiOperation({ summary: '[Admin] Update company status' })
  updateCompanyStatus(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Body() dto: UpdateCompanyStatusDto,
  ) {
    return this.companiesService.updateCompanyStatus(companyId, dto);
  }

  // ─── Tiers ───────────────────────────────────────────────────────────────────

  @Get(':companyId/tiers')
  @Roles(Role.ADMIN, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'List tiers for a company' })
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
  @Roles(Role.ADMIN, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Create a tier for a company' })
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
  @Roles(Role.ADMIN, Role.COMPANY_ADMIN)
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
  @Roles(Role.ADMIN, Role.COMPANY_ADMIN)
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
  @Roles(Role.ADMIN, Role.COMPANY_ADMIN)
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
    return this.companiesService.listEmployees(companyId, Number(page), Number(limit));
  }

  @Post(':companyId/employees')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Add an employee to a company (invites if new user)' })
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
  @Roles(Role.ADMIN, Role.COMPANY_ADMIN)
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
  @Roles(Role.ADMIN, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: "Reassign an employee's tier" })
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
  @Roles(Role.ADMIN, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'List admins of a company' })
  async listAdmins(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companiesService.listAdmins(companyId);
  }

  @Post(':companyId/admins/:userId')
  @HttpCode(HttpStatus.CREATED)
  @Roles(Role.ADMIN, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Grant company admin role to a user' })
  async addAdmin(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companiesService.addAdmin(companyId, targetUserId);
  }

  @Delete(':companyId/admins/:userId')
  @HttpCode(HttpStatus.OK)
  @Roles(Role.ADMIN, Role.COMPANY_ADMIN)
  @ApiOperation({ summary: 'Revoke company admin role from a user' })
  async removeAdmin(
    @Param('companyId', ParseUUIDPipe) companyId: string,
    @Param('userId', ParseUUIDPipe) targetUserId: string,
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
  ) {
    await this.companiesService.assertCompanyAccess(companyId, userId, roles);
    return this.companiesService.removeAdmin(companyId, targetUserId);
  }
}
