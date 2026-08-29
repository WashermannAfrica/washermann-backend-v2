import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AuditService } from './audit.service';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Audit')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly audit: AuditService) {}

  @Get()
  @ApiOperation({ summary: '[Admin] Query the platform-wide audit log' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'search', required: false, type: String })
  @ApiQuery({ name: 'app', required: false, type: String })
  @ApiQuery({ name: 'category', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'actorType', required: false, type: String })
  @ApiQuery({ name: 'actorId', required: false, type: String })
  @ApiQuery({ name: 'targetId', required: false, type: String })
  @ApiQuery({ name: 'success', required: false, type: Boolean })
  @ApiQuery({ name: 'from', required: false, type: String, description: 'ISO date (inclusive)' })
  @ApiQuery({ name: 'to', required: false, type: String, description: 'ISO date (inclusive)' })
  list(
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('search') search?: string,
    @Query('app') app?: string,
    @Query('category') category?: string,
    @Query('action') action?: string,
    @Query('actorType') actorType?: string,
    @Query('actorId') actorId?: string,
    @Query('targetId') targetId?: string,
    @Query('success') success?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.audit.query({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 25,
      search,
      app,
      category,
      action,
      actorType,
      actorId,
      targetId,
      success: success === 'true' ? true : success === 'false' ? false : undefined,
      from,
      to,
    });
  }

  @Get('filters')
  @ApiOperation({ summary: '[Admin] Distinct values for the audit-log filter dropdowns' })
  filters() {
    return this.audit.filterOptions();
  }
}
