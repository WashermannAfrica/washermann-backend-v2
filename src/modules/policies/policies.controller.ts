import { Controller, Get, Param, ParseIntPipe } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { PoliciesService } from './policies.service';
import { Public } from '../../common/decorators/public.decorator';

/** Public policy surface — consumed by the marketing site and the "By signing up…" links. */
@ApiTags('Policies (public)')
@Controller('policies')
export class PoliciesController {
  constructor(private readonly service: PoliciesService) {}

  @Get()
  @Public()
  @ApiOperation({ summary: 'Public: list of active, published policies (for a legal index/footer)' })
  list() {
    return this.service.listPublic();
  }

  @Get(':key')
  @Public()
  @ApiOperation({ summary: 'Public: the currently-published version of a policy by slug' })
  get(@Param('key') key: string) {
    return this.service.getPublic(key);
  }

  @Get(':key/versions/:versionNumber')
  @Public()
  @ApiOperation({ summary: 'Public: a specific pinned version (for a consent record link)' })
  getVersion(
    @Param('key') key: string,
    @Param('versionNumber', ParseIntPipe) versionNumber: number,
  ) {
    return this.service.getPublicVersion(key, versionNumber);
  }
}
