import {
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  Request,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { AssignmentService } from './assignment.service';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';

@ApiTags('Assignment')
@Controller('assignment')
export class AssignmentController {
  constructor(private readonly assignmentService: AssignmentService) {}

  // ─── Admin: manually start assignment ────────────────────────────────────────

  @Post('orders/:orderId/start-rep')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Start rep assignment broadcast for an order (admin)' })
  startRepAssignment(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.assignmentService.startRepAssignment(orderId);
  }

  // ─── Rep / Vendor: my assignment offers (pullable queue + history) ─────────────

  @Get('me/rep-requests')
  @Roles(Role.REP)
  @ApiOperation({ summary: 'Rep: my assignment offers — pending + missed/responded history' })
  myRepRequests(@Request() req: { user: { sub: string } }) {
    return this.assignmentService.myRequests(req.user.sub, 'rep');
  }

  @Get('me/vendor-requests')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Vendor: my assignment offers — pending + missed/responded history' })
  myVendorRequests(@Request() req: { user: { sub: string } }) {
    return this.assignmentService.myRequests(req.user.sub, 'vendor');
  }

  // ─── Rep: accept assignment ───────────────────────────────────────────────────

  @Post('orders/:orderId/accept/rep')
  @Roles(Role.REP)
  @ApiOperation({ summary: 'Rep accepts order assignment' })
  async repAccepts(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.assignmentService.repAccepts(orderId, req.user.sub);
  }

  // ─── Vendor: accept assignment ────────────────────────────────────────────────

  @Post('orders/:orderId/accept/vendor')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Vendor accepts order assignment' })
  async vendorAccepts(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.assignmentService.vendorAccepts(orderId, req.user.sub);
  }

  // ─── Rep / Vendor: decline assignment (fast-forwards the batch) ────────────────

  @Post('orders/:orderId/decline/rep')
  @Roles(Role.REP)
  @ApiOperation({ summary: 'Rep declines an offer — batch advances immediately once all offers resolve' })
  repDeclines(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.assignmentService.repDeclines(orderId, req.user.sub);
  }

  @Post('orders/:orderId/decline/vendor')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Vendor declines an offer — batch advances immediately once all offers resolve' })
  vendorDeclines(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.assignmentService.vendorDeclines(orderId, req.user.sub);
  }

  // ─── Admin: manual assignment ─────────────────────────────────────────────────

  @Post('orders/:orderId/assign/rep/:repId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin manually assigns a rep to an order' })
  adminAssignRep(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('repId', ParseUUIDPipe) repId: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.assignmentService.adminAssignRep(orderId, repId, req.user.sub);
  }

  @Post('orders/:orderId/assign/vendor/:vendorId')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin manually assigns a vendor to an order' })
  adminAssignVendor(
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Param('vendorId', ParseUUIDPipe) vendorId: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.assignmentService.adminAssignVendor(orderId, vendorId, req.user.sub);
  }

  // ─── Broadcast history ────────────────────────────────────────────────────────

  @Get('orders/:orderId/broadcasts')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Get broadcast history for an order (admin)' })
  getBroadcastHistory(@Param('orderId', ParseUUIDPipe) orderId: string) {
    return this.assignmentService.getBroadcastHistory(orderId);
  }
}
