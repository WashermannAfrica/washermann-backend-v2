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
  constructor(private readonly usersService: UsersService) {}

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
