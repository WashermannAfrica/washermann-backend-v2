import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { Company } from '../../database/entities/company.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { CompanyWallet } from '../../database/entities/company-wallet.entity';
import { Vault } from '../../database/entities/vault.entity';
import { Order } from '../../database/entities/order.entity';
import { Rep } from '../../database/entities/rep.entity';
import { PayoutRequest } from '../../database/entities/payout-request.entity';
import { OrderStatusHistory } from '../../database/entities/order-status-history.entity';
import { UserStatus } from '../../common/enums/user-status.enum';
import { CompanyActivationStatus } from '../../common/enums/company-activation-status.enum';
import { VaultStatus } from '../../database/entities/vault.entity';

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const PENDING_ORDER_STATUSES = ['paid', 'broadcasting_rep', 'rep_assigned', 'broadcasting_vendor', 'vendor_assigned', 'scheduled'];
const DONE_ORDER_STATUSES = ['delivered', 'completed', 'cancelled'];

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Company) private companyRepo: Repository<Company>,
    @InjectRepository(Wallet) private walletRepo: Repository<Wallet>,
    @InjectRepository(CompanyWallet) private companyWalletRepo: Repository<CompanyWallet>,
    @InjectRepository(Vault) private vaultRepo: Repository<Vault>,
    @InjectRepository(Order) private orderRepo: Repository<Order>,
    @InjectRepository(Rep) private repRepo: Repository<Rep>,
    @InjectRepository(PayoutRequest) private payoutRepo: Repository<PayoutRequest>,
    @InjectRepository(OrderStatusHistory) private historyRepo: Repository<OrderStatusHistory>,
  ) {}

  /**
   * Dashboard analytics — powers the revenue hero, the 5-stat row, the
   * activity chart, the orders-per-month chart, the overdue/pending KPIs and
   * the recent-activities feed.
   *
   * Metric definitions (⚠ confirm with product):
   *  - revenueNaira: GMV — SUM(naira_equivalent_snapshot) across all orders.
   *  - contractWorkers: number of Reps (field contractors).
   *  - disputes: 0 for now — there is no disputes entity yet.
   *  - overdueOrders: past delivery_deadline and not delivered/completed/cancelled.
   *  - pendingOrders: placed but not yet picked up.
   */
  async getAnalytics() {
    const now = new Date();
    const year = now.getFullYear();

    const [orders, companies, contractWorkers, users, pendingPayouts] = await Promise.all([
      this.orderRepo.count(),
      this.companyRepo.count(),
      this.repRepo.count(),
      this.userRepo.count(),
      this.payoutRepo.count({ where: { status: In(['pending', 'processing']) as never } }),
    ]);

    const rev = await this.orderRepo
      .createQueryBuilder('o')
      .select('COALESCE(SUM(o.naira_equivalent_snapshot), 0)', 'total')
      .getRawOne<{ total: string }>();
    const revenueNaira = Number(rev?.total ?? 0);

    const overdueOrders = await this.orderRepo
      .createQueryBuilder('o')
      .where('o.delivery_deadline IS NOT NULL AND o.delivery_deadline < :now', { now })
      .andWhere('o.status NOT IN (:...done)', { done: DONE_ORDER_STATUSES })
      .getCount();

    const pendingOrders = await this.orderRepo
      .createQueryBuilder('o')
      .where('o.status IN (:...p)', { p: PENDING_ORDER_STATUSES })
      .getCount();

    // Orders per month for the current calendar year (Jan–Dec, zero-filled).
    const rawMonthly = await this.orderRepo
      .createQueryBuilder('o')
      .select('EXTRACT(MONTH FROM o.created_at)', 'm')
      .addSelect('COUNT(*)', 'count')
      .where('EXTRACT(YEAR FROM o.created_at) = :year', { year })
      .groupBy('m')
      .getRawMany<{ m: string; count: string }>();
    const monthMap = new Map(rawMonthly.map((r) => [Number(r.m), Number(r.count)]));
    const ordersPerMonth = SHORT_MONTHS.map((month, i) => ({ month, count: monthMap.get(i + 1) ?? 0 }));

    // Recent activity — latest order status changes, tagged with the order ref.
    const rawActivity = await this.historyRepo
      .createQueryBuilder('h')
      .leftJoin('orders', 'o', 'o.id = h.order_id')
      .select(['h.id AS id', 'h.to_status AS status', 'h.created_at AS at', 'o.reference AS reference'])
      .orderBy('h.created_at', 'DESC')
      .limit(8)
      .getRawMany<{ id: string; status: string; at: Date; reference: string }>();
    const recentActivities = rawActivity.map((a) => ({
      id: a.id,
      reference: a.reference,
      status: a.status,
      at: a.at,
    }));

    return {
      revenueNaira,
      pendingPayouts,
      counts: { orders, companies, contractWorkers, users, disputes: 0 },
      overdueOrders,
      pendingOrders,
      ordersPerMonth,
      recentActivities,
    };
  }

  async getOverviewStats() {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    // ── Users ────────────────────────────────────────────────────────────────
    const [totalUsers, activeUsers, pendingUsers, suspendedUsers, newUsersThisWeek] =
      await Promise.all([
        this.userRepo.count(),
        this.userRepo.count({ where: { status: UserStatus.ACTIVE } }),
        this.userRepo.count({ where: { status: UserStatus.PENDING } }),
        this.userRepo.count({ where: { status: UserStatus.SUSPENDED } }),
        this.userRepo
          .createQueryBuilder('u')
          .where('u.created_at >= :since', { since: sevenDaysAgo })
          .getCount(),
      ]);

    // ── Companies ────────────────────────────────────────────────────────────
    const [totalCompanies, activeCompanies, pendingCompanies, awaitingApproval] =
      await Promise.all([
        this.companyRepo.count(),
        this.companyRepo.count({ where: { activationStatus: CompanyActivationStatus.ACTIVE } }),
        this.companyRepo.count({ where: { activationStatus: CompanyActivationStatus.PENDING } }),
        this.companyRepo.count({ where: { activationStatus: CompanyActivationStatus.AWAITING_APPROVAL } }),
      ]);

    // ── WashPoints in circulation ─────────────────────────────────────────────
    const userWpResult = await this.walletRepo
      .createQueryBuilder('w')
      .select('COALESCE(SUM(w.balance), 0)', 'total')
      .getRawOne<{ total: string }>();

    const companyWpResult = await this.companyWalletRepo
      .createQueryBuilder('cw')
      .select('COALESCE(SUM(cw.wp_balance), 0)', 'total')
      .getRawOne<{ total: string }>();

    const wpInCirculation =
      Number(userWpResult?.total ?? 0) + Number(companyWpResult?.total ?? 0);

    // ── Default Vault ─────────────────────────────────────────────────────────
    const defaultVault = await this.vaultRepo.findOne({
      where: { isDefault: true, status: VaultStatus.ACTIVE },
    });

    // ── Recent users (last 10) ─────────────────────────────────────────────────
    const recentUsers = await this.userRepo.find({
      order: { createdAt: 'DESC' },
      take: 10,
      select: ['id', 'fullName', 'email', 'phone', 'roles', 'status', 'createdAt'],
    });

    return {
      users: {
        total: totalUsers,
        active: activeUsers,
        pending: pendingUsers,
        suspended: suspendedUsers,
        newThisWeek: newUsersThisWeek,
      },
      companies: {
        total: totalCompanies,
        active: activeCompanies,
        pendingActivation: pendingCompanies,
        awaitingApproval,
      },
      washPoints: {
        inCirculation: wpInCirculation,
        userHeld: Number(userWpResult?.total ?? 0),
        companyHeld: Number(companyWpResult?.total ?? 0),
      },
      vault: defaultVault
        ? {
            id: defaultVault.id,
            name: defaultVault.name,
            totalPoints: Number(defaultVault.totalPoints),
            usedPoints: Number(defaultVault.usedPoints),
            remainingPoints:
              Number(defaultVault.totalPoints) - Number(defaultVault.usedPoints),
            usagePercent:
              defaultVault.totalPoints > 0
                ? Math.round(
                    (Number(defaultVault.usedPoints) / Number(defaultVault.totalPoints)) * 100,
                  )
                : 0,
            status: defaultVault.status,
          }
        : null,
      recentUsers,
    };
  }
}
