import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { Repository } from 'typeorm';
import { User } from '../entities/user.entity';
import { Role } from '../../common/enums/roles.enum';
import { UserStatus } from '../../common/enums/user-status.enum';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
  ) {}

  // Runs automatically once the app is fully bootstrapped
  async onApplicationBootstrap() {
    const env = this.configService.get<string>('app.env');

    // Auto-seed only in development and staging
    if (env === 'production') {
      this.logger.log(
        'Production environment — skipping auto-seed. Use POST /auth/setup to create super admin.',
      );
      return;
    }

    await this.seedSuperAdmin();
  }

  private async seedSuperAdmin() {
    const adminEmail = this.configService.get<string>('seed.adminEmail');
    const adminPassword = this.configService.get<string>('seed.adminPassword');
    const adminName = this.configService.get<string>('seed.adminName');
    const adminPhone = this.configService.get<string>('seed.adminPhone');

    if (!adminEmail || !adminPassword) {
      this.logger.warn(
        'SEED_ADMIN_EMAIL or SEED_ADMIN_PASSWORD not set — skipping admin seed.',
      );
      return;
    }

    // Check if any admin already exists
    // roles is stored as simple-array (plain text, comma-separated) — use LIKE not ANY()
    const existingAdmin = await this.userRepository
      .createQueryBuilder('user')
      .where('user.roles LIKE :role', { role: `%${Role.ADMIN}%` })
      .getOne();

    if (existingAdmin) {
      this.logger.log(`Super admin already exists (${existingAdmin.email}) — seed skipped.`);
      return;
    }

    const passwordHash = await bcrypt.hash(adminPassword, 12);

    const admin = this.userRepository.create({
      fullName: adminName || 'Super Admin',
      email: adminEmail.toLowerCase(),
      phone: adminPhone || null,
      passwordHash,
      roles: [Role.ADMIN],
      status: UserStatus.ACTIVE,
      emailVerified: true,
      phoneVerified: !!adminPhone,
    });

    await this.userRepository.save(admin);

    this.logger.log(
      `✅ Super admin seeded: ${admin.email} (ID: ${admin.id})`,
    );
  }
}
