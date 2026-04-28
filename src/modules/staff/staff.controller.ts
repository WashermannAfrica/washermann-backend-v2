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
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { StaffService } from './staff.service';
import { InviteStaffDto } from './dto/invite-staff.dto';
import { UpdateStaffRoleDto } from './dto/update-staff-role.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Staff')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/staff')
export class StaffController {
  constructor(private readonly staffService: StaffService) {}

  @Post()
  @ApiOperation({ summary: 'Invite a new platform staff member (Admin)' })
  invite(@Body() dto: InviteStaffDto, @CurrentUser('id') adminId: string) {
    return this.staffService.inviteStaff(dto, adminId);
  }

  @Get()
  @ApiOperation({ summary: 'List all platform staff (Admin)' })
  list(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.staffService.listStaff(Number(page), Number(limit));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get staff member details (Admin)' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.staffService.getStaff(id);
  }

  @Patch(':id/role')
  @ApiOperation({ summary: 'Update staff member role (Admin)' })
  updateRole(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateStaffRoleDto,
    @CurrentUser('id') callerId: string,
  ) {
    return this.staffService.updateStaffRole(id, dto, callerId);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Deactivate a staff member (Admin)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') callerId: string) {
    return this.staffService.deactivateStaff(id, callerId);
  }
}
