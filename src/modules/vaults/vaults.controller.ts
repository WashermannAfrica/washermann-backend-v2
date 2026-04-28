import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { VaultsService } from './vaults.service';
import { CreateVaultDto } from './dto/create-vault.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Vaults')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(Role.ADMIN)
@Controller('admin/vaults')
export class VaultsController {
  constructor(private readonly vaultsService: VaultsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new vault (Admin)' })
  create(@Body() dto: CreateVaultDto, @CurrentUser('id') adminId: string) {
    return this.vaultsService.createVault(dto, adminId);
  }

  @Get()
  @ApiOperation({ summary: 'List all vaults (Admin)' })
  list(@Query('page') page = 1, @Query('limit') limit = 20) {
    return this.vaultsService.listVaults(Number(page), Number(limit));
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get vault details (Admin)' })
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.vaultsService.getVault(id);
  }

  @Patch(':id/deactivate')
  @ApiOperation({ summary: 'Deactivate a vault (Admin)' })
  deactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser('id') adminId: string) {
    return this.vaultsService.deactivateVault(id, adminId);
  }

  @Patch(':id/set-default')
  @ApiOperation({ summary: 'Set vault as primary default (Admin)' })
  setDefault(@Param('id', ParseUUIDPipe) id: string) {
    return this.vaultsService.setDefault(id);
  }
}
