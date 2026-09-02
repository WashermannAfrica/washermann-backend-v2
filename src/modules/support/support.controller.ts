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
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { SupportService } from './support.service';
import { SendSupportMessageDto, UpdateConversationDto } from './dto/support.dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Support Chat')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('support')
export class SupportController {
  constructor(private readonly support: SupportService) {}

  // ─── User (customer / vendor / wash rep) ───────────────────────────────────────

  @Get('conversation')
  @ApiOperation({ summary: 'Open my support thread + latest messages (creates it on first open)' })
  myConversation(@CurrentUser('id') userId: string, @CurrentUser('roles') roles: Role[]) {
    return this.support.getMyConversation(userId, roles as unknown as string[]);
  }

  @Get('conversation/messages')
  @ApiOperation({ summary: 'Paginate my messages (older, for scroll-back)' })
  @ApiQuery({ name: 'before', required: false, description: 'ISO timestamp — load messages older than this' })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  myMessages(
    @CurrentUser('id') userId: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    return this.support.getMyMessages(userId, before, limit ? +limit : 30);
  }

  @Post('conversation/messages')
  @ApiOperation({ summary: 'Send a message to support' })
  send(
    @CurrentUser('id') userId: string,
    @CurrentUser('roles') roles: Role[],
    @Body() dto: SendSupportMessageDto,
  ) {
    return this.support.sendAsUser(userId, roles as unknown as string[], dto);
  }

  @Post('conversation/read')
  @ApiOperation({ summary: 'Mark support messages as read' })
  read(@CurrentUser('id') userId: string) {
    return this.support.markReadByUser(userId);
  }

  // ─── Agent (admin / dispute resolver / finance) ────────────────────────────────

  @Get('conversations')
  @Roles(Role.ADMIN, Role.DISPUTE_RESOLVER, Role.FINANCE)
  @ApiOperation({ summary: '[Agent] Support inbox' })
  @ApiQuery({ name: 'status', required: false, description: 'open | pending | closed' })
  @ApiQuery({ name: 'search', required: false, description: 'user name / email' })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  inbox(
    @Query('status') status?: string,
    @Query('search') search?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    return this.support.agentList({ status, search, page: page ? +page : 1, limit: limit ? +limit : 25 });
  }

  @Get('conversations/:id')
  @Roles(Role.ADMIN, Role.DISPUTE_RESOLVER, Role.FINANCE)
  @ApiOperation({ summary: '[Agent] Open a conversation (marks it read for agents)' })
  agentGet(@Param('id', ParseUUIDPipe) id: string) {
    return this.support.agentGet(id);
  }

  @Post('conversations/:id/messages')
  @Roles(Role.ADMIN, Role.DISPUTE_RESOLVER, Role.FINANCE)
  @ApiOperation({ summary: '[Agent] Reply in a conversation' })
  agentSend(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') agentId: string,
    @Body() dto: SendSupportMessageDto,
  ) {
    return this.support.agentSend(id, agentId, dto);
  }

  @Patch('conversations/:id')
  @Roles(Role.ADMIN, Role.DISPUTE_RESOLVER, Role.FINANCE)
  @ApiOperation({ summary: '[Agent] Assign to me / change status (open|pending|closed)' })
  agentUpdate(
    @Param('id', ParseUUIDPipe) id: string,
    @CurrentUser('id') agentId: string,
    @Body() dto: UpdateConversationDto,
  ) {
    return this.support.agentUpdate(id, agentId, dto);
  }
}
