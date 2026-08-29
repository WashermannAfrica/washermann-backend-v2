import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { Address } from '../../database/entities/address.entity';
import { Order } from '../../database/entities/order.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { CompanyEmployee } from '../../database/entities/company-employee.entity';
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

const DONE_ORDER_STATUSES = ['delivered', 'completed'];

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Address)
    private addressRepository: Repository<Address>,
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    @InjectRepository(Wallet)
    private walletRepository: Repository<Wallet>,
    @InjectRepository(CompanyEmployee)
    private companyEmployeeRepository: Repository<CompanyEmployee>,
  ) {}

  // ─── Profile ─────────────────────────────────────────────────────────────────

  async getProfile(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    return { data: this.sanitizeUser(user) };
  }

  async updateProfile(userId: string, dto: UpdateUserDto) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    // Check for conflicts if email/phone is being changed
    if (dto.email && dto.email.toLowerCase() !== user.email) {
      const emailTaken = await this.userRepository.findOne({
        where: { email: dto.email.toLowerCase() },
      });
      if (emailTaken)
        throw new ConflictException('Email already in use by another account');
    }

    if (dto.phone && dto.phone !== user.phone) {
      const phoneTaken = await this.userRepository.findOne({
        where: { phone: dto.phone },
      });
      if (phoneTaken)
        throw new ConflictException(
          'Phone number already in use by another account',
        );
    }

    if (dto.fullName) user.fullName = dto.fullName;
    if (dto.email) user.email = dto.email.toLowerCase();
    if (dto.phone) user.phone = dto.phone;

    await this.userRepository.save(user);

    return { data: this.sanitizeUser(user), message: 'Profile updated' };
  }

  async updateFcmToken(userId: string, token: string) {
    await this.userRepository.update({ id: userId }, { fcmToken: token || null });
    return { message: 'FCM token updated' };
  }

  // ─── Addresses ───────────────────────────────────────────────────────────────

  async getAddresses(userId: string) {
    const addresses = await this.addressRepository.find({
      where: { userId },
      order: { isDefault: 'DESC', createdAt: 'DESC' },
    });

    return { data: addresses };
  }

  async addAddress(userId: string, dto: CreateAddressDto) {
    // If this is to be default, unset existing default first
    if (dto.isDefault) {
      await this.addressRepository.update({ userId }, { isDefault: false });
    }

    // If user has no addresses yet, make the first one default automatically
    const count = await this.addressRepository.count({ where: { userId } });
    const isDefault = dto.isDefault ?? count === 0;

    const address = this.addressRepository.create({
      userId,
      addressText: dto.addressText,
      latitude: dto.latitude,
      longitude: dto.longitude,
      isDefault,
    });

    await this.addressRepository.save(address);

    return { data: address, message: 'Address added' };
  }

  async updateAddress(userId: string, addressId: string, dto: UpdateAddressDto) {
    const address = await this.findAddressOrFail(userId, addressId);

    if (dto.isDefault) {
      await this.addressRepository.update({ userId }, { isDefault: false });
    }

    Object.assign(address, dto);
    await this.addressRepository.save(address);

    return { data: address, message: 'Address updated' };
  }

  async deleteAddress(userId: string, addressId: string) {
    const address = await this.findAddressOrFail(userId, addressId);

    await this.addressRepository.remove(address);

    // If the deleted address was default, promote the most recent one
    if (address.isDefault) {
      const next = await this.addressRepository.findOne({
        where: { userId },
        order: { createdAt: 'DESC' },
      });
      if (next) {
        next.isDefault = true;
        await this.addressRepository.save(next);
      }
    }

    return { data: null, message: 'Address deleted' };
  }

  async setDefaultAddress(userId: string, addressId: string) {
    await this.findAddressOrFail(userId, addressId);

    // Unset all
    await this.addressRepository.update({ userId }, { isDefault: false });
    // Set the target
    await this.addressRepository.update(
      { id: addressId, userId },
      { isDefault: true },
    );

    const updated = await this.addressRepository.findOne({
      where: { id: addressId },
    });

    return { data: updated, message: 'Default address updated' };
  }

  // ─── Profile completion ───────────────────────────────────────────────────────

  /**
   * Returns a structured checklist of what is required before a customer can
   * place an order.  `isComplete` is the single gate condition.
   */
  async getProfileCompletion(userId: string) {
    const [user, addressCount] = await Promise.all([
      this.userRepository.findOne({ where: { id: userId } }),
      this.addressRepository.count({ where: { userId } }),
    ]);

    if (!user) throw new NotFoundException('User not found');

    const hasPhone   = !!user.phone && user.phone.trim().length > 0;
    const hasAddress = addressCount > 0;

    const missingFields: string[] = [];
    if (!hasPhone)   missingFields.push('phone');
    if (!hasAddress) missingFields.push('address');

    const isComplete = hasPhone && hasAddress;

    return {
      isComplete,
      checks: {
        phone:   hasPhone,
        address: hasAddress,
      },
      missingFields,
      message: isComplete
        ? 'Profile complete — ready to place orders'
        : `Complete your profile to place orders. Missing: ${missingFields.join(', ')}`,
    };
  }

  /**
   * Throws a structured `BadRequestException` when the user's profile is incomplete.
   * Called by OrdersService before accepting any order placement.
   */
  async assertOrderEligibility(userId: string): Promise<void> {
    const completion = await this.getProfileCompletion(userId);
    if (!completion.isComplete) {
      throw new BadRequestException({
        message: 'Profile incomplete — cannot place order',
        missingFields: completion.missingFields,
        hint: 'Add a phone number and at least one delivery address to your profile.',
      });
    }
  }

  // ─── Admin ───────────────────────────────────────────────────────────────────

  async getUserById(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return { data: this.sanitizeUser(user) };
  }

  /**
   * Enriched detail for the admin user page: the user, their wallet, order
   * summary + recent orders, and their company memberships. Everything here is
   * real data — the admin detail page must not fall back to fixtures.
   */
  async getUserDetail(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    const [wallet, orders, memberships, agg] = await Promise.all([
      this.walletRepository.findOne({ where: { userId } }),
      this.orderRepository.find({
        where: { customerId: userId },
        order: { createdAt: 'DESC' },
        take: 20,
      }),
      this.companyEmployeeRepository
        .createQueryBuilder('e')
        .leftJoin('e.company', 'c')
        .leftJoin('e.tier', 't')
        .select([
          'e.id AS id',
          'e.company_id AS "companyId"',
          'e.assignment_status AS "status"',
          'c.name AS "companyName"',
          't.name AS "tierName"',
        ])
        .where('e.user_id = :userId', { userId })
        .getRawMany<{ id: string; companyId: string; status: string; companyName: string | null; tierName: string | null }>(),
      this.orderRepository
        .createQueryBuilder('o')
        .select('COUNT(*)', 'total')
        .addSelect(
          `COUNT(*) FILTER (WHERE o.status IN (:...done))`,
          'completed',
        )
        .addSelect('COALESCE(SUM(o.naira_equivalent_snapshot), 0)', 'spent')
        .where('o.customer_id = :userId', { userId })
        .setParameter('done', DONE_ORDER_STATUSES)
        .getRawOne<{ total: string; completed: string; spent: string }>(),
    ]);

    return {
      data: {
        user: this.sanitizeUser(user),
        wallet: {
          balanceWP: wallet ? Number(wallet.balance) : 0,
          fiatKobo: wallet ? Number(wallet.fiatBalanceKobo ?? 0) : 0,
        },
        stats: {
          totalOrders: Number(agg?.total ?? 0),
          completedOrders: Number(agg?.completed ?? 0),
          totalSpentNaira: Number(agg?.spent ?? 0),
        },
        orders: orders.map((o) => ({
          id: o.id,
          reference: o.reference,
          serviceType: o.serviceType,
          status: o.status,
          totalWP: Number(o.totalWP),
          nairaEquivalentSnapshot: o.nairaEquivalentSnapshot != null ? Number(o.nairaEquivalentSnapshot) : null,
          createdAt: o.createdAt,
        })),
        memberships,
      },
    };
  }

  /**
   * Roles that have their own dedicated admin module (Washermen, Reps, Companies,
   * Staff). When `customersOnly` is set, users carrying any of these are excluded
   * so the admin Users list is customers only.
   */
  private static readonly OWN_MODULE_ROLES = [
    'vendor',
    'rep',
    'sales_rep',
    'company_owner',
    'company_admin',
    'admin',
    'finance',
    'dispute_resolver',
    'washerman',
  ];

  async listUsers(
    page = 1,
    limit = 20,
    search?: string,
    status?: string,
    sortBy?: string,
    sortDir?: 'ASC' | 'DESC',
    customersOnly = false,
  ) {
    const SORTABLE: Record<string, string> = {
      createdAt: 'u.createdAt',
      name: 'u.fullName',
      email: 'u.email',
      status: 'u.status',
    };
    const sortCol = SORTABLE[sortBy ?? ''] ?? 'u.createdAt';
    const dir = sortDir === 'ASC' ? 'ASC' : 'DESC';

    const qb = this.userRepository
      .createQueryBuilder('u')
      .orderBy(sortCol, dir)
      .skip((page - 1) * limit)
      .take(limit);

    // Customers only: must hold the `user` role and none of the own-module roles
    // (vendors/reps/company/staff each live in their own admin module).
    if (customersOnly) {
      qb.andWhere(`string_to_array(u.roles, ',') && ARRAY['user']::text[]`);
      qb.andWhere(
        `NOT (string_to_array(u.roles, ',') && ARRAY[:...ownModuleRoles]::text[])`,
        { ownModuleRoles: UsersService.OWN_MODULE_ROLES },
      );
    }

    if (search) {
      qb.andWhere('(u.fullName ILIKE :q OR u.email ILIKE :q OR u.phone ILIKE :q)', {
        q: `%${search}%`,
      });
    }
    if (status) qb.andWhere('u.status = :st', { st: status });

    const [users, total] = await qb.getManyAndCount();
    return {
      data: users.map((u) => this.sanitizeUser(u)),
      meta: { total, page, limit, pages: Math.ceil(total / limit) },
    };
  }

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  private async findAddressOrFail(
    userId: string,
    addressId: string,
  ): Promise<Address> {
    const address = await this.addressRepository.findOne({
      where: { id: addressId, userId },
    });

    if (!address) {
      throw new NotFoundException('Address not found');
    }

    return address;
  }

  private sanitizeUser(user: User) {
    const { passwordHash, ...safe } = user as any;
    return safe;
  }
}
