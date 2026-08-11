import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  ParseUUIDPipe,
  Post,
  Query,
  Request,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { OrdersService } from './orders.service';
import { RepsService } from '../reps/reps.service';
import { PlaceOrderDto } from './dto/place-order.dto';
import { LogGarmentCountDto } from './dto/garment-log.dto';
import { RateOrderDto } from './dto/rate-order.dto';
import { Roles } from '../../common/decorators/roles.decorator';
import { Role } from '../../common/enums/roles.enum';
import { OrderStatus } from '../../common/enums/order-status.enum';
import { IsString, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

class CancelOrderDto {
  @ApiProperty()
  @IsString()
  @MaxLength(1000)
  reason: string;
}

@ApiTags('Orders')
@Controller('orders')
export class OrdersController {
  constructor(
    private readonly ordersService: OrdersService,
    private readonly repsService: RepsService,
  ) {}

  // ─── Customer: place order ────────────────────────────────────────────────────

  @Post()
  @ApiOperation({ summary: 'Place a new order (customer)' })
  placeOrder(
    @Body() dto: PlaceOrderDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.ordersService.placeOrder(req.user.sub, dto);
  }

  // ─── Admin: list all orders ───────────────────────────────────────────────────

  @Get()
  @Roles(Role.ADMIN, Role.FINANCE, Role.DISPUTE_RESOLVER)
  @ApiOperation({ summary: 'List orders (admin)' })
  @ApiQuery({ name: 'page',       required: false, type: Number })
  @ApiQuery({ name: 'limit',      required: false, type: Number })
  @ApiQuery({ name: 'customerId', required: false, type: String })
  @ApiQuery({ name: 'repId',      required: false, type: String })
  @ApiQuery({ name: 'vendorId',   required: false, type: String })
  @ApiQuery({ name: 'status',     required: false, enum: OrderStatus })
  @ApiQuery({ name: 'areaId',     required: false, type: String })
  findAll(
    @Query('page',       new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit',      new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('customerId') customerId?: string,
    @Query('repId')      repId?: string,
    @Query('vendorId')   vendorId?: string,
    @Query('status')     status?: OrderStatus,
    @Query('areaId')     areaId?: string,
  ) {
    return this.ordersService.findAll({ page, limit, customerId, repId, vendorId, status, areaId });
  }

  // ─── Customer: my orders ──────────────────────────────────────────────────────

  @Get('me')
  @ApiOperation({ summary: 'List own orders (customer)' })
  myOrders(
    @Request() req: { user: { sub: string } },
    @Query('page',   new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit',  new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: OrderStatus,
  ) {
    return this.ordersService.findAll({ page, limit, customerId: req.user.sub, status });
  }

  // ─── Rep: my assigned orders ──────────────────────────────────────────────────

  @Get('rep/me')
  @Roles(Role.REP)
  @ApiOperation({ summary: 'List own assigned orders (rep)' })
  async repOrders(
    @Request() req: { user: { sub: string } },
    @Query('page',   new DefaultValuePipe(1),  ParseIntPipe) page: number,
    @Query('limit',  new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('status') status?: OrderStatus,
  ) {
    const rep = await this.repsService.findByUserId(req.user.sub);
    return this.ordersService.findAll({ page, limit, repId: rep.id, status });
  }

  // ─── Get one order ────────────────────────────────────────────────────────────

  @Get(':id')
  @ApiOperation({ summary: 'Get order by ID' })
  findOne(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.findOne(id);
  }

  // ─── Get status history ───────────────────────────────────────────────────────

  @Get(':id/history')
  @ApiOperation({ summary: 'Get order status history' })
  getStatusHistory(@Param('id', ParseUUIDPipe) id: string) {
    return this.ordersService.getStatusHistory(id);
  }

  // ─── Rep: log garment count at pickup ─────────────────────────────────────────

  @Post(':id/garment-log')
  @Roles(Role.REP)
  @ApiOperation({ summary: 'Log garment count at pickup (rep)' })
  logGarmentCount(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: LogGarmentCountDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.ordersService.logGarmentCount(id, req.user.sub, dto);
  }

  // ─── Status transitions (role-specific) ──────────────────────────────────────

  @Post(':id/status/en-route')
  @Roles(Role.REP)
  @ApiOperation({ summary: 'Rep marks that they are en route to pickup' })
  markRepEnRoute(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.ordersService.repTransition(id, OrderStatus.REP_EN_ROUTE_PICKUP, req.user.sub);
  }

  @Post(':id/status/picked-up')
  @Roles(Role.REP)
  @ApiOperation({ summary: 'Rep marks order as picked up' })
  markPickedUp(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.ordersService.repTransition(id, OrderStatus.PICKED_UP, req.user.sub);
  }

  @Post(':id/status/in-progress')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Vendor marks order as in progress (washing started)' })
  markInProgress(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.ordersService.transition(id, OrderStatus.IN_PROGRESS, req.user.sub, 'vendor');
  }

  @Post(':id/status/ready-for-delivery')
  @Roles(Role.VENDOR)
  @ApiOperation({ summary: 'Vendor marks order as ready for delivery' })
  markReadyForDelivery(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.ordersService.transition(id, OrderStatus.READY_FOR_DELIVERY, req.user.sub, 'vendor');
  }

  @Post(':id/status/rep-collected')
  @Roles(Role.REP)
  @ApiOperation({ summary: 'Rep confirms pickup from vendor' })
  markRepCollected(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.ordersService.repTransition(id, OrderStatus.REP_COLLECTED, req.user.sub);
  }

  @Post(':id/status/out-for-delivery')
  @Roles(Role.REP)
  @ApiOperation({ summary: 'Rep marks order as out for delivery' })
  markOutForDelivery(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.ordersService.repTransition(id, OrderStatus.OUT_FOR_DELIVERY, req.user.sub);
  }

  @Post(':id/status/delivered')
  @Roles(Role.REP)
  @ApiOperation({ summary: 'Rep marks order as delivered' })
  markDelivered(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.ordersService.repTransition(id, OrderStatus.DELIVERED, req.user.sub);
  }

  // ─── Customer: confirm delivery ───────────────────────────────────────────────

  @Post(':id/confirm-delivery')
  @ApiOperation({ summary: 'Customer confirms delivery and triggers escrow release' })
  confirmDelivery(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.ordersService.completeOrder(id, req.user.sub, 'customer');
  }

  // ─── Customer: cancel order ───────────────────────────────────────────────────

  @Post(':id/cancel')
  @ApiOperation({ summary: 'Cancel an order (customer)' })
  cancelOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: CancelOrderDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.ordersService.cancelOrder(id, req.user.sub, dto.reason);
  }

  // ─── Customer: rate order ─────────────────────────────────────────────────────

  @Post(':id/rate')
  @ApiOperation({ summary: 'Rate an order (customer)' })
  rateOrder(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RateOrderDto,
    @Request() req: { user: { sub: string } },
  ) {
    return this.ordersService.rateOrder(id, req.user.sub, dto);
  }

  // ─── Admin: force-complete ────────────────────────────────────────────────────

  @Post(':id/admin/complete')
  @Roles(Role.ADMIN)
  @ApiOperation({ summary: 'Admin force-completes an order (releases escrow)' })
  adminComplete(
    @Param('id', ParseUUIDPipe) id: string,
    @Request() req: { user: { sub: string } },
  ) {
    return this.ordersService.completeOrder(id, req.user.sub, 'admin');
  }
}
