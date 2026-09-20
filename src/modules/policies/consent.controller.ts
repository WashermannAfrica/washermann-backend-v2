import { Body, Controller, Get, Headers, Ip, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ConsentService } from './consent.service';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { AcceptPoliciesDto } from './dto/policy.dto';

type AuthUser = { id: string; roles: string[] };

/** Authenticated user consent — "By signing up you agree…" capture + re-consent. */
@ApiTags('Policies — consent')
@ApiBearerAuth()
@Controller('policies/consent')
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  @Get('pending')
  @ApiOperation({ summary: 'Policies the signed-in user must (re)accept for their role' })
  pending(@CurrentUser() user: AuthUser) {
    return this.consent.getPending(user.id, user.roles ?? []);
  }

  @Post('accept')
  @ApiOperation({ summary: 'Record acceptance of the current version of the given (or all pending) policies' })
  accept(
    @CurrentUser() user: AuthUser,
    @Body() dto: AcceptPoliciesDto,
    @Ip() ip: string,
    @Headers('user-agent') userAgent: string,
  ) {
    return this.consent.accept(user.id, user.roles ?? [], dto.keys, dto.method ?? 'explicit', { ip, userAgent });
  }

  @Get('history')
  @ApiOperation({ summary: "The signed-in user's own acceptance history (consent evidence)" })
  history(@CurrentUser() user: AuthUser) {
    return this.consent.history(user.id);
  }
}
