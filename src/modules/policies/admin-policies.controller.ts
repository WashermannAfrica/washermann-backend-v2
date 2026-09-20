import {
  BadRequestException, Body, Controller, Get, Param, ParseIntPipe, ParseUUIDPipe, Patch, Post,
  UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PoliciesService } from './policies.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';
import {
  CreatePolicyDto, UpdatePolicyDto, CreateVersionDto, UpdateVersionDto, UploadVersionDto,
} from './dto/policy.dto';

const DOCX_MIME = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

/** Admin policy CMS — create policies, draft new versions, publish (version-pinned). */
@ApiTags('Policies (admin)')
@ApiBearerAuth()
@Controller('admin/policies')
export class AdminPoliciesController {
  constructor(private readonly service: PoliciesService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List all policies with version counts' })
  list() {
    return this.service.adminList();
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new policy (slug identity)' })
  create(@Body() dto: CreatePolicyDto) {
    return this.service.adminCreatePolicy(dto);
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'One policy with its versions (newest first)' })
  getOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.adminGetOne(id);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Update policy metadata (title, audiences, active…)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdatePolicyDto) {
    return this.service.adminUpdatePolicy(id, dto);
  }

  @Get(':id/versions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'List versions of a policy (newest first)' })
  listVersions(@Param('id', ParseUUIDPipe) id: string) {
    return this.service.adminListVersions(id);
  }

  @Post(':id/versions')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a new DRAFT version (Markdown)' })
  createVersion(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateVersionDto) {
    return this.service.adminCreateVersion(id, dto);
  }

  @Post(':id/versions/upload')
  @Roles(Role.ADMIN)
  @ApiConsumes('multipart/form-data')
  @UseInterceptors(FileInterceptor('file', { storage: memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } }))
  @ApiOperation({ summary: 'Upload a .docx → converted to Markdown as a new DRAFT version' })
  uploadVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
    @Body() dto: UploadVersionDto,
  ) {
    if (!file) throw new BadRequestException('No file uploaded');
    const isDocx = file.mimetype === DOCX_MIME || /\.docx$/i.test(file.originalname ?? '');
    if (!isDocx) throw new BadRequestException('Only .docx files are supported');
    return this.service.adminCreateVersionFromDocx(id, file.buffer, {
      effectiveDate: dto.effectiveDate,
      changeSummary: dto.changeSummary,
    });
  }

  @Patch(':id/versions/:versionNumber')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Edit a DRAFT version (published versions are immutable)' })
  updateVersion(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
    @Body() dto: UpdateVersionDto,
  ) {
    return this.service.adminUpdateVersion(id, versionNumber, dto);
  }

  @Post(':id/versions/:versionNumber/publish')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Publish a version — becomes live, previous published version archived' })
  publish(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
    @CurrentUser('id') userId: string,
  ) {
    return this.service.adminPublishVersion(id, versionNumber, userId);
  }
}
