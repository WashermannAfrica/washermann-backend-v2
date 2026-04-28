import { Controller, Get, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN, Role.FINANCE)
@Controller('admin')
export class AdminController {
  constructor(private readonly adminService: AdminService) {}

  @Get('overview')
  @ApiOperation({ summary: '[Admin] Platform-wide overview stats' })
  getOverview() {
    return this.adminService.getOverviewStats();
  }
}
