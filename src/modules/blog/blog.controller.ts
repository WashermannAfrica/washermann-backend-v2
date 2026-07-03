import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BlogService } from './blog.service';
import { CreateBlogPostDto, RequestChangesDto, UpdateBlogPostDto } from './dto/blog.dto';
import { Public } from '../../common/decorators/public.decorator';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';
import { BlogPostStatus } from '../../database/entities/blog-post.entity';

type Req = { user: { sub: string } };

// ─── Public: consumed by the landing site ──────────────────────────────────────

@ApiTags('Blog')
@Controller('blog')
export class BlogController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Public: published blog cards, newest first' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'tag', required: false, type: String })
  list(@Query('page') page?: string, @Query('limit') limit?: string, @Query('tag') tag?: string) {
    return this.blogService.publicList({
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 12,
      tag,
    });
  }

  @Get('preview/:id')
  @Public()
  @ApiOperation({ summary: 'Public: DRAFT copy via signed preview token (1h expiry) — for reviewers' })
  @ApiQuery({ name: 'token', required: true, type: String })
  preview(@Param('id', ParseUUIDPipe) id: string, @Query('token') token: string) {
    return this.blogService.previewGet(id, token);
  }

  @Get(':slug/related')
  @Public()
  @ApiOperation({ summary: 'Public: up to 3 published posts sharing a tag' })
  related(@Param('slug') slug: string) {
    return this.blogService.related(slug);
  }

  @Get(':slug')
  @Public()
  @ApiOperation({ summary: 'Public: full published post by slug (bumps view count)' })
  get(@Param('slug') slug: string) {
    return this.blogService.publicGet(slug);
  }
}

// ─── Admin: authoring + maker-checker review ───────────────────────────────────

@ApiTags('Blog')
@Controller('admin/blog')
export class BlogAdminController {
  constructor(private readonly blogService: BlogService) {}

  @Get()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'All posts, any status (admin)' })
  @ApiQuery({ name: 'status', required: false, enum: BlogPostStatus })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  adminList(
    @Query('status') status?: BlogPostStatus,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.blogService.adminList({
      status,
      page: page ? Number(page) : 1,
      limit: limit ? Number(limit) : 20,
    });
  }

  @Get(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'One post with draft + published copies (admin)' })
  adminGet(@Param('id', ParseUUIDPipe) id: string) {
    return this.blogService.adminGet(id);
  }

  @Post()
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Create a draft post — caller becomes the author (admin)' })
  create(@Body() dto: CreateBlogPostDto, @Request() req: Req) {
    return this.blogService.create(dto, req.user.sub);
  }

  @Patch(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Edit the draft copy (blocked while in review; slug locked after first publish)' })
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateBlogPostDto, @Request() req: Req) {
    return this.blogService.update(id, dto, req.user.sub);
  }

  @Delete(':id')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Delete a never-published draft (published posts must be archived)' })
  remove(@Param('id', ParseUUIDPipe) id: string) {
    return this.blogService.remove(id);
  }

  @Post(':id/submit')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Submit the draft for review — notifies other admins' })
  submit(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.blogService.submit(id, req.user.sub);
  }

  @Post(':id/approve')
  @Roles(Role.ADMIN)
  @ApiOperation({
    summary: 'Approve & publish (four-eyes: reviewer must differ from author/submitter). Copies draft → live snapshot.',
  })
  approve(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.blogService.approve(id, req.user.sub);
  }

  @Post(':id/request-changes')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Send back to the author with a note (four-eyes applies)' })
  requestChanges(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RequestChangesDto, @Request() req: Req) {
    return this.blogService.requestChanges(id, req.user.sub, dto.note);
  }

  @Post(':id/archive')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Hide from the public site (snapshot retained)' })
  archive(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.blogService.archive(id, req.user.sub);
  }

  @Post(':id/unarchive')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Restore an archived post (published again if it has a live snapshot)' })
  unarchive(@Param('id', ParseUUIDPipe) id: string, @Request() req: Req) {
    return this.blogService.unarchive(id, req.user.sub);
  }

  @Post(':id/preview-token')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Mint a 1-hour signed preview token for the landing preview route' })
  previewToken(@Param('id', ParseUUIDPipe) id: string) {
    return this.blogService.previewToken(id);
  }
}
