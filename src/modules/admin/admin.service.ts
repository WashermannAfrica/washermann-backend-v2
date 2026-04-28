import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../database/entities/user.entity';
import { Company } from '../../database/entities/company.entity';
import { Wallet } from '../../database/entities/wallet.entity';
import { CompanyWallet } from '../../database/entities/company-wallet.entity';
import { Vault } from '../../database/entities/vault.entity';
import { UserStatus } from '../../common/enums/user-status.enum';
import { CompanyActivationStatus } from '../../common/enums/company-activation-status.enum';
import { VaultStatus } from '../../database/entities/vault.entity';

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private userRepo: Repository<User>,
    @InjectRepository(Company) private companyRepo: Repository<Company>,
    @InjectRepository(Wallet) private walletRepo: Repository<Wallet>,
    @InjectRepository(CompanyWallet) private companyWalletRepo: Repository<CompanyWallet>,
    @InjectRepository(Vault) private vaultRepo: Repository<Vault>,
  ) {}

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
