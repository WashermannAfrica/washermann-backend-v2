import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  Request,
  ParseUUIDPipe,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiOkResponse,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../../../common/guards/jwt-auth.guard';
import { InAppService } from './in-app.service';

@ApiTags('In-App Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications/me')
export class InAppController {
  constructor(private readonly inAppService: InAppService) {}

  // GET /notifications/me
  @Get()
  @ApiOperation({ summary: 'Get my in-app notification inbox (paginated)' })
  @ApiQuery({ name: 'page',  required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ description: 'Paginated list of in-app notifications' })
  findAll(
    @Request() req,
    @Query('page',  new DefaultValuePipe(1),  ParseIntPipe) page:  number,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
  ) {
    return this.inAppService.findForUser(req.user.sub, page, limit);
  }

  // GET /notifications/me/unread-count
  @Get('unread-count')
  @ApiOperation({ summary: 'Get count of unread in-app notifications' })
  async unreadCount(@Request() req) {
    const count = await this.inAppService.getUnreadCount(req.user.sub);
    return { count };
  }

  // POST /notifications/me/:id/read
  @Post(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  markRead(
    @Request() req,
    @Param('id', ParseUUIDPipe) id: string,
  ) {
    return this.inAppService.markRead(id, req.user.sub);
  }

  // POST /notifications/me/read-all
  @Post('read-all')
  @ApiOperation({ summary: 'Mark all my notifications as read' })
  markAllRead(@Request() req) {
    return this.inAppService.markAllRead(req.user.sub);
  }
}
