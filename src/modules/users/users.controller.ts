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
import { UsersService } from './users.service';
import { CompaniesService } from '../companies/companies.service';
import { TeamsService } from '../teams/teams.service';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UsersController {
  constructor(
    private readonly usersService: UsersService,
    private readonly companiesService: CompaniesService,
    private readonly teamsService: TeamsService,
  ) {}

  // ─── Profile ──────────────────────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'Get own profile' })
  @ApiResponse({ status: 200, description: 'User profile' })
  getProfile(@CurrentUser('id') userId: string) {
    return this.usersService.getProfile(userId);
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update own profile' })
  @ApiResponse({ status: 200, description: 'Profile updated' })
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateUserDto,
  ) {
    return this.usersService.updateProfile(userId, dto);
  }

  @Get('me/profile-completion')
  @ApiOperation({
    summary: 'Check profile completion',
    description: 'Returns a checklist of what is required before the customer can place orders (phone + saved address).',
  })
  @ApiResponse({ status: 200, description: 'Profile completion status' })
  getProfileCompletion(@CurrentUser('id') userId: string) {
    return this.usersService.getProfileCompletion(userId);
  }

  // ─── FCM token registration ───────────────────────────────────────────────────

  @Patch('me/fcm-token')
  @ApiOperation({ summary: 'Register or update FCM device token for push notifications' })
  @ApiResponse({ status: 200, description: 'FCM token saved' })
  updateFcmToken(
    @CurrentUser('id') userId: string,
    @Body('token') token: string,
  ) {
    return this.usersService.updateFcmToken(userId, token);
  }

  // ─── Addresses ────────────────────────────────────────────────────────────────

  @Get('me/addresses')
  @ApiOperation({ summary: 'List all saved addresses' })
  getAddresses(@CurrentUser('id') userId: string) {
    return this.usersService.getAddresses(userId);
  }

  @Post('me/addresses')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Add a new address' })
  @ApiResponse({ status: 201, description: 'Address added' })
  addAddress(
    @CurrentUser('id') userId: string,
    @Body() dto: CreateAddressDto,
  ) {
    return this.usersService.addAddress(userId, dto);
  }

  @Patch('me/addresses/:id')
  @ApiOperation({ summary: 'Update an address' })
  updateAddress(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) addressId: string,
    @Body() dto: UpdateAddressDto,
  ) {
    return this.usersService.updateAddress(userId, addressId, dto);
  }

  @Delete('me/addresses/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an address' })
  deleteAddress(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) addressId: string,
  ) {
    return this.usersService.deleteAddress(userId, addressId);
  }

  @Patch('me/addresses/:id/default')
  @ApiOperation({ summary: 'Set address as default' })
  setDefaultAddress(
    @CurrentUser('id') userId: string,
    @Param('id', ParseUUIDPipe) addressId: string,
  ) {
    return this.usersService.setDefaultAddress(userId, addressId);
  }

  // ─── Company memberships (employee self-view) ─────────────────────────────────

  @Get('me/companies')
  @ApiOperation({ summary: "List the employee's active company memberships" })
  @ApiResponse({ status: 200, description: 'Company memberships' })
  getMyCompanies(@CurrentUser('id') userId: string) {
    return this.companiesService.getMyCompanies(userId);
  }

  // ─── Company admin dashboard — multi-company switcher ─────────────────────────

  @Get('me/admin-companies')
  @ApiOperation({
    summary: 'List all companies where the user is an owner or admin',
    description:
      'Used to populate the company switcher on the dashboard. ' +
      'Returns the companyRole (owner | admin) alongside each company so the ' +
      'dashboard can render the correct permissions UI.',
  })
  @ApiResponse({ status: 200, description: 'Companies with admin access' })
  getAdminCompanies(@CurrentUser('id') userId: string) {
    return this.companiesService.getAdminCompanies(userId);
  }

  // ─── Team memberships — team switcher ─────────────────────────────────────────

  @Get('me/teams')
  @ApiOperation({
    summary: 'List all teams the current user belongs to',
    description:
      'Returns every active team membership including the user\'s role in each team. ' +
      'Used to power the team switcher on the dashboard.',
  })
  getMyTeams(@CurrentUser('id') userId: string) {
    return this.teamsService.getMyTeams(userId);
  }

  // ─── Admin Endpoints ──────────────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] List all users' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  listUsers(
    @Query('page') page = 1,
    @Query('limit') limit = 20,
  ) {
    return this.usersService.listUsers(Number(page), Number(limit));
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: '[Admin] Get any user by ID' })
  getUserById(@Param('id', ParseUUIDPipe) userId: string) {
    return this.usersService.getUserById(userId);
  }
}
