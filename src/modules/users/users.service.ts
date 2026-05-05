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
import { UpdateUserDto } from './dto/update-user.dto';
import { CreateAddressDto } from './dto/create-address.dto';
import { UpdateAddressDto } from './dto/update-address.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(Address)
    private addressRepository: Repository<Address>,
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

  // ─── Admin ───────────────────────────────────────────────────────────────────

  async getUserById(userId: string) {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    return { data: this.sanitizeUser(user) };
  }

  async listUsers(page = 1, limit = 20) {
    const [users, total] = await this.userRepository.findAndCount({
      skip: (page - 1) * limit,
      take: limit,
      order: { createdAt: 'DESC' },
    });

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
